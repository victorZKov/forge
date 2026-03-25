import React, { useState } from 'react';
import {
  TextField,
  Button,
  Typography,
  Chip,
  CircularProgress,
  makeStyles,
} from '@material-ui/core';
import SendIcon from '@material-ui/icons/Send';
import { InfoCard } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useApi, fetchApiRef, discoveryApiRef } from '@backstage/core-plugin-api';

const useStyles = makeStyles(theme => ({
  form: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'flex-start',
  },
  input: {
    flex: 1,
  },
  answer: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
    whiteSpace: 'pre-wrap',
  },
  sources: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(1),
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: theme.spacing(2),
  },
  error: {
    marginTop: theme.spacing(2),
    color: theme.palette.error.main,
  },
}));

interface AskResponse {
  answer: string;
  sources?: { title: string; url?: string }[];
}

export const AskWidget = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entityRef = `component:default/${entity.metadata.name}`;

  const handleAsk = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const proxyUrl = await discoveryApi.getBaseUrl('proxy');
      const response = await fetchApi.fetch(
        `${proxyUrl}/ai-service/api/ask`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: question.trim(),
            entityRef,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `AI service responded with ${response.status}: ${response.statusText}`,
        );
      }

      const data: AskResponse = await response.json();
      setAnswer(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not reach the AI service. Please try again later.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <InfoCard title="Ask AI about this component">
      <div className={classes.form}>
        <TextField
          className={classes.input}
          variant="outlined"
          size="small"
          placeholder="Ask a question about this component's docs..."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          multiline
          maxRows={3}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          startIcon={loading ? <CircularProgress size={16} /> : <SendIcon />}
        >
          Ask AI
        </Button>
      </div>

      {loading && (
        <div className={classes.loading}>
          <CircularProgress size={24} />
        </div>
      )}

      {error && (
        <Typography variant="body2" className={classes.error}>
          {error}
        </Typography>
      )}

      {answer && (
        <>
          <Typography variant="body1" className={classes.answer}>
            {answer.answer}
          </Typography>
          {answer.sources && answer.sources.length > 0 && (
            <div className={classes.sources}>
              <Typography variant="caption" color="textSecondary">
                Sources:
              </Typography>
              {answer.sources.map((source, idx) => (
                <Chip
                  key={idx}
                  label={source.title}
                  size="small"
                  variant="outlined"
                  clickable={!!source.url}
                  component={source.url ? 'a' : 'span'}
                  href={source.url || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ))}
            </div>
          )}
        </>
      )}
    </InfoCard>
  );
};
