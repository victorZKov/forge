import React, { useState } from 'react';
import {
  Button,
  TextField,
  Typography,
  CircularProgress,
  makeStyles,
} from '@material-ui/core';
import WarningIcon from '@material-ui/icons/Warning';
import { InfoCard } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useApi, fetchApiRef, discoveryApiRef } from '@backstage/core-plugin-api';

const useStyles = makeStyles(theme => ({
  analysis: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    lineHeight: 1.6,
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

export const IncidentCard = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [errors, setErrors] = useState('');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entityRef = `component:default/${entity.metadata.name}`;

  const handleAnalyze = async () => {
    setLoading(true);
    setAnalysis(null);
    setError(null);

    try {
      const baseUrl = await discoveryApi.getBaseUrl('ai-incident');
      const res = await fetchApi.fetch(`${baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityRef,
          errors: errors || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Analysis failed: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to analyze. Check the AI service connection.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <InfoCard title="Incident Analysis" subheader="AI-assisted diagnosis">
      <TextField
        fullWidth
        multiline
        rows={3}
        variant="outlined"
        placeholder="Paste error messages or log excerpts here (optional)"
        value={errors}
        onChange={e => setErrors(e.target.value)}
        disabled={loading}
      />
      <Button
        variant="contained"
        color="primary"
        onClick={handleAnalyze}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={16} /> : <WarningIcon />}
        style={{ marginTop: 8 }}
      >
        {loading ? 'Analyzing...' : 'Analyze Incident'}
      </Button>

      {error && (
        <Typography variant="body2" className={classes.error}>
          {error}
        </Typography>
      )}

      {analysis && (
        <Typography variant="body1" className={classes.analysis}>
          {analysis}
        </Typography>
      )}
    </InfoCard>
  );
};
