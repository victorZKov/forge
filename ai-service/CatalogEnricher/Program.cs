using System.ClientModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Azure.AI.OpenAI;
using OpenAI;
using OpenAI.Chat;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
        policy.WithOrigins("http://localhost:3000", "http://localhost:7007")
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

app.Run();

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
