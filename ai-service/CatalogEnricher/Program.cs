using System.ClientModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Azure.AI.OpenAI;
using Npgsql;
using OpenAI;
using OpenAI.Chat;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
        policy.WithOrigins("http://localhost:3456", "http://localhost:7007", "http://localhost:7008")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var app = builder.Build();
app.UseCors("DevCors");

app.MapGet("/healthz", () => Results.Ok(new { status = "healthy" }));

app.MapPost("/api/enrich", async (EnrichRequest request, IConfiguration config) =>
{
    if (request.Files is not { Count: > 0 })
        return Results.BadRequest(new { error = "At least one file is required." });

    var endpoint = config["AI:Endpoint"];
    var apiKey = config["AI:Key"];
    var model = config["AI:ChatModel"] ?? "mistral-large-latest";
    var provider = config["AI:Provider"] ?? "openai";

    ChatClient chatClient = provider.ToLowerInvariant() switch
    {
        "azure" => new AzureOpenAIClient(
            new Uri(endpoint!), new ApiKeyCredential(apiKey!))
            .GetChatClient(model),
        _ => new OpenAIClient(
            new ApiKeyCredential(apiKey!),
            new OpenAIClientOptions { Endpoint = new Uri(endpoint!) })
            .GetChatClient(model),
    };

    const int maxChars = 3000;
    var filesSummary = string.Join("\n\n", request.Files.Select(f =>
    {
        var content = f.Content.Length > maxChars
            ? f.Content[..maxChars] + "\n[...truncated]"
            : f.Content;
        return $"### {f.Path}\n```\n{content}\n```";
    }));

    var systemPrompt = """
        You are a code analysis assistant for a Backstage software catalog.
        Analyze the provided source files and return a JSON object with:
        - "description": a one-sentence summary of what this component does
        - "tags": an array of relevant technology tags
        - "dependencies": an array of external services this code depends on
        - "apiEndpoints": an array of API routes exposed by this code

        Rules:
        - Do not guess. Only report what is confirmed in the code.
        - Do not invent dependencies that are not explicitly imported.
        - Return ONLY valid JSON, no markdown fences, no extra text.
        """;

    try
    {
        var completion = await chatClient.CompleteChatAsync(
        [
            new SystemChatMessage(systemPrompt),
            new UserChatMessage($"Analyze these source files:\n\n{filesSummary}"),
        ]);

        var raw = completion.Value.Content[0].Text.Trim();
        var json = raw.StartsWith("```") ? raw.Split('\n', 2)[1].TrimEnd('`').Trim() : raw;

        var metadata = JsonSerializer.Deserialize<CatalogMetadata>(json, SerializerOptions.Default);
        return metadata is null
            ? Results.UnprocessableEntity(new { error = "AI returned invalid metadata." })
            : Results.Ok(metadata);
    }
    catch (ClientResultException ex) when (ex.Status == 401)
    {
        return Results.Json(new { error = "AI provider authentication failed." }, statusCode: 503);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = $"AI provider error: {ex.Message}" }, statusCode: 502);
    }
});

app.MapPost("/api/scaffold", async (ScaffoldRequest request, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Description))
        return Results.BadRequest(new { error = "Description is required." });

    var endpoint = config["AI:Endpoint"];
    var apiKey = config["AI:Key"];
    var model = config["AI:ChatModel"] ?? "mistral-small-3.2-24b-instruct-2506";
    var provider = config["AI:Provider"] ?? "openai";

    ChatClient chatClient = provider.ToLowerInvariant() switch
    {
        "azure" => new AzureOpenAIClient(
            new Uri(endpoint!), new ApiKeyCredential(apiKey!))
            .GetChatClient(model),
        _ => new OpenAIClient(
            new ApiKeyCredential(apiKey!),
            new OpenAIClientOptions { Endpoint = new Uri(endpoint!) })
            .GetChatClient(model),
    };

    var systemPrompt = """
        You are a project scaffolder for a .NET cloud platform.
        Given a service description, produce a JSON object with:

        - "name": kebab-case service name (e.g. "invoice-api")
        - "description": one-line description (max 120 chars)
        - "type": "api" | "worker" | "function"
        - "dependencies": object with boolean flags:
          { "postgresql": bool, "redis": bool, "serviceBus": bool, "blobStorage": bool }
        - "auth": "quantumid-jwt" | "api-key" | "none"
        - "kubernetes": true | false
        - "nugetPackages": array of NuGet package names needed
        - "envVars": array of environment variable names the service will need
        - "gotchaPrompt": a complete GOTCHA prompt with all 6 layers filled in
          for this specific service. Use the GOTCHA format:
          GOALS, ORCHESTRATION, TOOLS, CONTEXT, HEURISTICS, ARGS.
          Be specific to this service — not generic.

        Respond ONLY with valid JSON, no markdown.
        """;

    try
    {
        var completion = await chatClient.CompleteChatAsync(
        [
            new SystemChatMessage(systemPrompt),
            new UserChatMessage(request.Description),
        ]);

        var raw = completion.Value.Content[0].Text.Trim();
        var json = raw.StartsWith("```") ? raw.Split('\n', 2)[1].TrimEnd('`').Trim() : raw;

        var scaffold = JsonSerializer.Deserialize<ScaffoldResult>(json, SerializerOptions.Default);
        if (scaffold is null)
            return Results.UnprocessableEntity(new { error = "AI returned invalid scaffold spec." });

        // Normalize gotchaPrompt: if the AI returned an object, flatten it to a string
        var gotchaStr = scaffold.GotchaPrompt.ValueKind == JsonValueKind.String
            ? scaffold.GotchaPrompt.GetString() ?? ""
            : scaffold.GotchaPrompt.ToString();

        return Results.Ok(new
        {
            scaffold.Name, scaffold.Description, scaffold.Type,
            scaffold.Dependencies, scaffold.Auth, scaffold.Kubernetes,
            scaffold.NugetPackages, scaffold.EnvVars,
            gotchaPrompt = gotchaStr,
        });
    }
    catch (ClientResultException ex) when (ex.Status == 401)
    {
        return Results.Json(new { error = "AI provider authentication failed." }, statusCode: 503);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = $"AI provider error: {ex.Message}" }, statusCode: 502);
    }
});

app.MapPost("/api/review", async (ReviewRequest request, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Diff))
        return Results.BadRequest(new { error = "Diff is required." });

    var endpoint = config["AI:Endpoint"];
    var apiKey = config["AI:Key"];
    var model = config["AI:ChatModel"] ?? "mistral-small-3.2-24b-instruct-2506";
    var provider = config["AI:Provider"] ?? "openai";

    ChatClient chatClient = provider.ToLowerInvariant() switch
    {
        "azure" => new AzureOpenAIClient(
            new Uri(endpoint!), new ApiKeyCredential(apiKey!))
            .GetChatClient(model),
        _ => new OpenAIClient(
            new ApiKeyCredential(apiKey!),
            new OpenAIClientOptions { Endpoint = new Uri(endpoint!) })
            .GetChatClient(model),
    };

    var systemPrompt = $"""
        You are a senior code reviewer for the {request.ServiceName} service.

        SERVICE CONTEXT (from the Software Catalog):
        Description: {request.ServiceDescription}
        Tags: {string.Join(", ", request.Tags)}
        Dependencies: {string.Join(", ", request.Dependencies)}

        ARCHITECTURAL RULES (from GOTCHA.md):
        {request.GotchaHeuristics}

        Review the following pull request diff. Focus on:
        1. Violations of the architectural rules listed above
        2. Security issues (authentication, input validation, secrets)
        3. Patterns that contradict the service's documented purpose
        4. Missing error handling for the specific dependencies this service uses

        Do NOT comment on:
        - Code style (formatting, naming conventions) — the linter handles that
        - Generic best practices that don't relate to this specific service

        Format your review as a list of findings. For each finding:
        - File and line reference
        - What the issue is
        - Why it matters for THIS service specifically
        - Suggested fix

        If the code looks good, say so. Don't invent problems.
        """;

    try
    {
        var completion = await chatClient.CompleteChatAsync(
        [
            new SystemChatMessage(systemPrompt),
            new UserChatMessage($"PR: {request.PrTitle}\n\nDiff:\n{request.Diff}"),
        ]);

        var review = completion.Value.Content[0].Text.Trim();
        return Results.Ok(new { review });
    }
    catch (ClientResultException ex) when (ex.Status == 401)
    {
        return Results.Json(new { error = "AI provider authentication failed." }, statusCode: 503);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = $"AI provider error: {ex.Message}" }, statusCode: 502);
    }
});

// --- RAG: TechDocs indexing and search ---

var pgConnectionString = builder.Configuration["Rag:PostgresConnection"];

app.MapPost("/api/index-doc", async (IndexDocRequest request, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Content))
        return Results.BadRequest(new { error = "Content is required." });

    var connStr = config["Rag:PostgresConnection"];
    if (string.IsNullOrEmpty(connStr))
        return Results.Json(new { error = "RAG not configured (Rag:PostgresConnection missing)." }, statusCode: 503);

    var endpoint = config["AI:Endpoint"];
    var apiKey = config["AI:Key"];
    var embeddingModel = config["AI:EmbeddingModel"] ?? "bge-multilingual-gemma2";

    var openAiClient = new OpenAIClient(
        new ApiKeyCredential(apiKey!),
        new OpenAIClientOptions { Endpoint = new Uri(endpoint!) });
    var embeddingClient = openAiClient.GetEmbeddingClient(embeddingModel);

    var chunks = SplitIntoChunks(request.Content, maxChars: 2000);

    await using var dataSource = NpgsqlDataSource.Create(connStr);

    for (var i = 0; i < chunks.Count; i++)
    {
        var embedding = await embeddingClient.GenerateEmbeddingAsync(chunks[i]);
        var vector = embedding.Value.ToFloats();
        var vectorStr = "[" + string.Join(",", vector.ToArray().Select(f => f.ToString("G"))) + "]";

        await using var cmd = dataSource.CreateCommand();
        cmd.CommandText = """
            INSERT INTO doc_chunks (entity_ref, doc_path, chunk_index, content, embedding)
            VALUES ($1, $2, $3, $4, $5::vector)
            ON CONFLICT (entity_ref, doc_path, chunk_index)
            DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
            """;

        cmd.Parameters.AddWithValue(request.EntityRef);
        cmd.Parameters.AddWithValue(request.DocPath);
        cmd.Parameters.AddWithValue(i);
        cmd.Parameters.AddWithValue(chunks[i]);
        cmd.Parameters.AddWithValue(vectorStr);

        await cmd.ExecuteNonQueryAsync();
    }

    return Results.Ok(new { chunksIndexed = chunks.Count });
});

app.MapPost("/api/ask", async (AskRequest request, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Question))
        return Results.BadRequest(new { error = "Question is required." });

    var connStr = config["Rag:PostgresConnection"];
    if (string.IsNullOrEmpty(connStr))
        return Results.Json(new { error = "RAG not configured (Rag:PostgresConnection missing)." }, statusCode: 503);

    var endpoint = config["AI:Endpoint"];
    var apiKey = config["AI:Key"];
    var model = config["AI:ChatModel"] ?? "mistral-small-3.2-24b-instruct-2506";
    var embeddingModel = config["AI:EmbeddingModel"] ?? "bge-multilingual-gemma2";
    var provider = config["AI:Provider"] ?? "openai";

    var openAiClient = new OpenAIClient(
        new ApiKeyCredential(apiKey!),
        new OpenAIClientOptions { Endpoint = new Uri(endpoint!) });
    var embeddingClient = openAiClient.GetEmbeddingClient(embeddingModel);

    ChatClient chatClient = provider.ToLowerInvariant() switch
    {
        "azure" => new AzureOpenAIClient(
            new Uri(endpoint!), new ApiKeyCredential(apiKey!))
            .GetChatClient(model),
        _ => openAiClient.GetChatClient(model),
    };

    // 1. Embed the question
    var questionEmbedding = await embeddingClient.GenerateEmbeddingAsync(request.Question);
    var vector = questionEmbedding.Value.ToFloats();
    var vectorStr = "[" + string.Join(",", vector.ToArray().Select(f => f.ToString("G"))) + "]";

    // 2. Search for similar chunks
    await using var dataSource = NpgsqlDataSource.Create(connStr);
    await using var cmd = dataSource.CreateCommand();
    cmd.CommandText = """
        SELECT entity_ref, doc_path, content,
               1 - (embedding <=> $1::vector) AS similarity
        FROM doc_chunks
        WHERE ($2 = '' OR entity_ref = $2)
        ORDER BY embedding <=> $1::vector
        LIMIT 5
        """;

    cmd.Parameters.AddWithValue(vectorStr);
    cmd.Parameters.AddWithValue(request.EntityRef ?? "");

    var contexts = new List<DocContext>();
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        contexts.Add(new DocContext(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetFloat(3)));
    }

    if (contexts.Count == 0)
    {
        return Results.Ok(new AskResponse(
            "I couldn't find any relevant documentation for your question.",
            Array.Empty<SourceReference>()));
    }

    // 3. Build prompt with retrieved context
    var contextBlock = string.Join("\n\n",
        contexts.Select(c =>
            $"[Source: {c.DocPath} ({c.EntityRef})]\n{c.Content}"));

    try
    {
        var completion = await chatClient.CompleteChatAsync(
        [
            new SystemChatMessage($"""
                You are a platform documentation assistant.
                Answer the question using ONLY the documentation excerpts provided below.
                If the answer is not in the documentation, say so — do not make things up.
                Always cite the source document for each fact you reference.

                DOCUMENTATION:
                {contextBlock}
                """),
            new UserChatMessage(request.Question),
        ]);

        var answer = completion.Value.Content[0].Text.Trim();
        var sources = contexts
            .Select(c => new SourceReference(c.EntityRef, c.DocPath, c.Similarity))
            .ToArray();

        return Results.Ok(new AskResponse(answer, sources));
    }
    catch (ClientResultException ex) when (ex.Status == 401)
    {
        return Results.Json(new { error = "AI provider authentication failed." }, statusCode: 503);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = $"AI provider error: {ex.Message}" }, statusCode: 502);
    }
});

static List<string> SplitIntoChunks(string text, int maxChars)
{
    var chunks = new List<string>();
    var paragraphs = text.Split("\n\n", StringSplitOptions.RemoveEmptyEntries);
    var current = new System.Text.StringBuilder();

    foreach (var paragraph in paragraphs)
    {
        if (current.Length + paragraph.Length > maxChars && current.Length > 0)
        {
            chunks.Add(current.ToString().Trim());
            current.Clear();
        }
        current.AppendLine(paragraph);
        current.AppendLine();
    }

    if (current.Length > 0)
        chunks.Add(current.ToString().Trim());

    return chunks;
}

// --- Governance: Usage tracking and policy endpoints ---

app.MapGet("/api/governance/usage", async (string? action, string? team, int? days, IConfiguration config) =>
{
    var connStr = config["Rag:PostgresConnection"];
    if (string.IsNullOrEmpty(connStr))
        return Results.Json(new { error = "Governance not configured." }, statusCode: 503);

    var daysValue = days ?? 30;
    await using var dataSource = NpgsqlDataSource.Create(connStr);
    await using var cmd = dataSource.CreateCommand();
    cmd.CommandText = """
        SELECT action, team, status,
               COUNT(*) as call_count,
               COALESCE(SUM(input_tokens), 0) as total_input_tokens,
               COALESCE(SUM(output_tokens), 0) as total_output_tokens,
               COALESCE(AVG(duration_ms), 0) as avg_duration_ms
        FROM ai_usage_log
        WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
          AND ($2 = '' OR action = $2)
          AND ($3 = '' OR team = $3)
        GROUP BY action, team, status
        ORDER BY call_count DESC
        """;

    cmd.Parameters.AddWithValue(daysValue > 0 ? daysValue : 30);
    cmd.Parameters.AddWithValue(action ?? "");
    cmd.Parameters.AddWithValue(team ?? "");

    var results = new List<object>();
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new
        {
            action = reader.GetString(0),
            team = reader.IsDBNull(1) ? "unknown" : reader.GetString(1),
            status = reader.GetString(2),
            callCount = reader.GetInt64(3),
            totalInputTokens = reader.GetInt64(4),
            totalOutputTokens = reader.GetInt64(5),
            avgDurationMs = reader.GetDouble(6)
        });
    }

    return Results.Ok(results);
});

app.MapGet("/api/governance/costs", async (int? days, IConfiguration config) =>
{
    var connStr = config["Rag:PostgresConnection"];
    if (string.IsNullOrEmpty(connStr))
        return Results.Json(new { error = "Governance not configured." }, statusCode: 503);

    var daysValue = days ?? 30;
    await using var dataSource = NpgsqlDataSource.Create(connStr);
    await using var cmd = dataSource.CreateCommand();
    cmd.CommandText = """
        SELECT DATE(timestamp) as day,
               COALESCE(SUM(input_tokens), 0) as input_tokens,
               COALESCE(SUM(output_tokens), 0) as output_tokens
        FROM ai_usage_log
        WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
          AND status = 'success'
        GROUP BY DATE(timestamp)
        ORDER BY day
        """;
    cmd.Parameters.AddWithValue(daysValue > 0 ? daysValue : 30);

    var results = new List<object>();
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        var inputTokens = reader.GetInt64(1);
        var outputTokens = reader.GetInt64(2);
        // Adjust pricing per your provider and model
        var cost = (inputTokens * 2.0 / 1_000_000) +
                   (outputTokens * 6.0 / 1_000_000);

        results.Add(new
        {
            day = reader.GetDateTime(0).ToString("yyyy-MM-dd"),
            inputTokens,
            outputTokens,
            estimatedCostUsd = Math.Round(cost, 4)
        });
    }

    return Results.Ok(results);
});

app.MapGet("/api/governance/policies", async (IConfiguration config) =>
{
    var connStr = config["Rag:PostgresConnection"];
    if (string.IsNullOrEmpty(connStr))
        return Results.Json(new { error = "Governance not configured." }, statusCode: 503);

    await using var dataSource = NpgsqlDataSource.Create(connStr);
    await using var cmd = dataSource.CreateCommand();
    cmd.CommandText = "SELECT id, team, action, enabled, max_daily_calls FROM ai_policies ORDER BY team, action";

    var results = new List<object>();
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new
        {
            id = reader.GetInt32(0),
            team = reader.GetString(1),
            action = reader.GetString(2),
            enabled = reader.GetBoolean(3),
            maxDailyCalls = reader.IsDBNull(4) ? (int?)null : reader.GetInt32(4)
        });
    }
    return Results.Ok(results);
});

app.MapPut("/api/governance/policies", async (PolicyUpdate update, IConfiguration config) =>
{
    var connStr = config["Rag:PostgresConnection"];
    if (string.IsNullOrEmpty(connStr))
        return Results.Json(new { error = "Governance not configured." }, statusCode: 503);

    await using var dataSource = NpgsqlDataSource.Create(connStr);
    await using var cmd = dataSource.CreateCommand();
    cmd.CommandText = """
        INSERT INTO ai_policies (team, action, enabled, max_daily_calls)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (team, action)
        DO UPDATE SET enabled = EXCLUDED.enabled,
                      max_daily_calls = EXCLUDED.max_daily_calls,
                      updated_at = NOW()
        """;
    cmd.Parameters.AddWithValue(update.Team);
    cmd.Parameters.AddWithValue(update.Action);
    cmd.Parameters.AddWithValue(update.Enabled);
    cmd.Parameters.AddWithValue(update.MaxDailyCalls.HasValue
        ? update.MaxDailyCalls.Value : DBNull.Value);

    await cmd.ExecuteNonQueryAsync();
    return Results.Ok(new { status = "updated" });
});

app.Run();

record PolicyUpdate(string Team, string Action, bool Enabled, int? MaxDailyCalls);

record IndexDocRequest(string EntityRef, string DocPath, string Content);
record AskRequest(string Question, string? EntityRef);
record AskResponse(string Answer, SourceReference[] Sources);
record SourceReference(string EntityRef, string DocPath, float Similarity);
record DocContext(string EntityRef, string DocPath, string Content, float Similarity);

record ReviewRequest(
    string ServiceName,
    string ServiceDescription,
    string[] Tags,
    string[] Dependencies,
    string GotchaHeuristics,
    string PrTitle,
    string Diff);

record ScaffoldRequest(string Description);
record ScaffoldResult(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("dependencies")] Dictionary<string, bool> Dependencies,
    [property: JsonPropertyName("auth")] string Auth,
    [property: JsonPropertyName("kubernetes")] bool Kubernetes,
    [property: JsonPropertyName("nugetPackages")] List<string> NugetPackages,
    [property: JsonPropertyName("envVars")] List<string> EnvVars,
    [property: JsonPropertyName("gotchaPrompt")] JsonElement GotchaPrompt);

record EnrichRequest(List<SourceFile> Files);
record SourceFile(string Path, string Content);
record CatalogMetadata(
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("tags")] List<string> Tags,
    [property: JsonPropertyName("dependencies")] List<string> Dependencies,
    [property: JsonPropertyName("apiEndpoints")] List<string> ApiEndpoints);

static class SerializerOptions
{
    public static readonly JsonSerializerOptions Default = new()
    {
        PropertyNameCaseInsensitive = true,
    };
}
