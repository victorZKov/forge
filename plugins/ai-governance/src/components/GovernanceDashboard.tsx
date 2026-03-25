import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Grid,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Switch,
} from '@material-ui/core';
import { Header, Page, Content } from '@backstage/core-components';
import { useApi, fetchApiRef, discoveryApiRef } from '@backstage/core-plugin-api';

interface UsageSummary {
  action: string;
  team: string;
  status: string;
  callCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number;
}

interface CostEntry {
  day: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

interface Policy {
  id: number;
  team: string;
  action: string;
  enabled: boolean;
  maxDailyCalls: number | null;
}

export const GovernanceDashboard = () => {
  const [usage, setUsage] = useState<UsageSummary[]>([]);
  const [costs, setCosts] = useState<CostEntry[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const days = 30;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const proxyUrl = await discoveryApi.getBaseUrl('proxy');
      const [usageRes, costsRes, policiesRes] = await Promise.all([
        fetchApi.fetch(`${proxyUrl}/ai-service/api/governance/usage?days=${days}`),
        fetchApi.fetch(`${proxyUrl}/ai-service/api/governance/costs?days=${days}`),
        fetchApi.fetch(`${proxyUrl}/ai-service/api/governance/policies`),
      ]);

      if (usageRes.ok) setUsage(await usageRes.json());
      if (costsRes.ok) setCosts(await costsRes.json());
      if (policiesRes.ok) setPolicies(await policiesRes.json());
    } catch {
      // AI service not available — dashboard shows empty state
    }
  };

  const totalCost = costs.reduce((sum, c) => sum + c.estimatedCostUsd, 0);
  const totalCalls = usage
    .filter(u => u.status === 'success')
    .reduce((sum, u) => sum + u.callCount, 0);

  const togglePolicy = async (policy: Policy) => {
    const proxyUrl = await discoveryApi.getBaseUrl('proxy');
    await fetchApi.fetch(`${proxyUrl}/ai-service/api/governance/policies`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: policy.team,
        action: policy.action,
        enabled: !policy.enabled,
        maxDailyCalls: policy.maxDailyCalls,
      }),
    });
    fetchData();
  };

  return (
    <Page themeId="tool">
      <Header title="AI Governance" subtitle="Usage, costs, and policies for AI features" />
      <Content>
        <Grid container spacing={3}>
          <Grid item md={4} xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h4">{totalCalls}</Typography>
                <Typography color="textSecondary">
                  AI calls (last {days} days)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item md={4} xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h4">
                  ${totalCost.toFixed(2)}
                </Typography>
                <Typography color="textSecondary">
                  Estimated cost (last {days} days)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item md={4} xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h4">
                  {usage.filter(u => u.status === 'blocked').length}
                </Typography>
                <Typography color="textSecondary">
                  Blocked by policy
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item md={12}>
            <Card>
              <CardHeader title="Usage by Action" />
              <CardContent>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Action</TableCell>
                      <TableCell>Team</TableCell>
                      <TableCell align="right">Calls</TableCell>
                      <TableCell align="right">Input Tokens</TableCell>
                      <TableCell align="right">Output Tokens</TableCell>
                      <TableCell align="right">Avg Duration</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {usage.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.action}</TableCell>
                        <TableCell>{row.team}</TableCell>
                        <TableCell align="right">{row.callCount}</TableCell>
                        <TableCell align="right">
                          {row.totalInputTokens.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          {row.totalOutputTokens.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          {Math.round(row.avgDurationMs)}ms
                        </TableCell>
                        <TableCell>{row.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>

          <Grid item md={12}>
            <Card>
              <CardHeader title="Policies" />
              <CardContent>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Team</TableCell>
                      <TableCell>Action</TableCell>
                      <TableCell>Enabled</TableCell>
                      <TableCell>Daily Limit</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {policies.map(policy => (
                      <TableRow key={policy.id}>
                        <TableCell>{policy.team}</TableCell>
                        <TableCell>{policy.action}</TableCell>
                        <TableCell>
                          <Switch
                            checked={policy.enabled}
                            onChange={() => togglePolicy(policy)}
                          />
                        </TableCell>
                        <TableCell>
                          {policy.maxDailyCalls ?? 'unlimited'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>

          <Grid item md={12}>
            <Card>
              <CardHeader title="Daily Cost Breakdown" />
              <CardContent>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Input Tokens</TableCell>
                      <TableCell align="right">Output Tokens</TableCell>
                      <TableCell align="right">Est. Cost (USD)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {costs.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.day}</TableCell>
                        <TableCell align="right">
                          {row.inputTokens.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          {row.outputTokens.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          ${row.estimatedCostUsd.toFixed(4)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
