import { Injectable } from '@nestjs/common';

export type VoteRejectionReason =
  | 'dependency_failure'
  | 'duplicate'
  | 'internal_error'
  | 'invalid_proof'
  | 'invalid_request'
  | 'not_open'
  | 'out_of_window'
  | 'wrong_context';

type Labels = Readonly<Record<string, string>>;

interface Sample {
  readonly labels: Labels;
  value: number;
}

interface SummarySample extends Sample {
  count: number;
}

const metricName = /^[a-z][a-z0-9_]*$/u;
const safeRoute = /^\/[A-Za-z0-9_:/.-]{1,200}$/u;

function labelsKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
}

function renderedLabels(labels: Labels): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '';
  return `{${entries
    .map(([key, value]) => `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    .join(',')}}`;
}

@Injectable()
export class OperationalMetricsService {
  private readonly counters = new Map<string, Map<string, Sample>>();
  private readonly gauges = new Map<string, Map<string, Sample>>();
  private readonly summaries = new Map<string, Map<string, SummarySample>>();

  recordHttp(route: string, statusCode: number, durationMs: number): void {
    const normalizedRoute = safeRoute.test(route) ? route : '/unmatched';
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    this.increment('http_requests_total', {
      route: normalizedRoute,
      service: 'votaciones-api',
      status_class: statusClass,
    });
    this.observe('http_request_duration_seconds', durationMs / 1_000, {
      route: normalizedRoute,
      service: 'votaciones-api',
    });
  }

  recordVoteAccepted(idempotentRetry: boolean): void {
    this.increment('vote_requests_total', { result_class: 'accepted' });
    if (idempotentRetry) this.increment('vote_duplicate_total');
  }

  recordVoteRejected(reason: VoteRejectionReason): void {
    this.increment('vote_requests_total', { result_class: 'rejected' });
    this.increment('vote_rejected_total', { reason_class: reason });
    if (reason === 'duplicate') this.increment('vote_duplicate_total');
  }

  proofStarted(): void {
    this.addGauge('proof_verification_inflight', 1);
  }

  proofFinished(durationMs: number, timedOut = false): void {
    this.addGauge('proof_verification_inflight', -1);
    this.observe('vote_proof_verification_duration_seconds', durationMs / 1_000);
    if (timedOut) this.increment('proof_verification_timeout_total');
  }

  observeVoteAcceptance(durationMs: number): void {
    this.observe('vote_accept_transaction_duration_seconds', durationMs / 1_000);
  }

  recordPostgresHealth(
    durationMs: number,
    state: 'healthy' | 'unavailable',
    pool: { idleCount: number; totalCount: number; waitingCount: number },
  ): void {
    this.observe('postgres_health_check_duration_seconds', durationMs / 1_000);
    this.increment('postgres_health_total', { result: state });
    this.setGauge('postgres_connections', pool.totalCount, { state: 'total' });
    this.setGauge('postgres_connections', pool.idleCount, { state: 'idle' });
    this.setGauge('postgres_connections', pool.waitingCount, { state: 'waiting' });
  }

  recordValkeyHealth(durationMs: number, state: 'healthy' | 'unavailable'): void {
    this.observe('valkey_health_check_duration_seconds', durationMs / 1_000);
    this.increment('valkey_health_total', { result: state });
  }

  renderOpenMetrics(): string {
    const lines: string[] = [];
    for (const [name, samples] of [...this.counters.entries()].sort()) {
      lines.push(`# TYPE ${name} counter`);
      for (const sample of [...samples.values()].sort((a, b) =>
        labelsKey(a.labels).localeCompare(labelsKey(b.labels)),
      )) {
        lines.push(`${name}${renderedLabels(sample.labels)} ${sample.value}`);
      }
    }
    for (const [name, samples] of [...this.gauges.entries()].sort()) {
      lines.push(`# TYPE ${name} gauge`);
      for (const sample of [...samples.values()].sort((a, b) =>
        labelsKey(a.labels).localeCompare(labelsKey(b.labels)),
      )) {
        lines.push(`${name}${renderedLabels(sample.labels)} ${sample.value}`);
      }
    }
    for (const [name, samples] of [...this.summaries.entries()].sort()) {
      lines.push(`# TYPE ${name} summary`);
      for (const sample of [...samples.values()].sort((a, b) =>
        labelsKey(a.labels).localeCompare(labelsKey(b.labels)),
      )) {
        const suffix = renderedLabels(sample.labels);
        lines.push(`${name}_count${suffix} ${sample.count}`);
        lines.push(`${name}_sum${suffix} ${sample.value}`);
      }
    }
    lines.push('# EOF');
    return `${lines.join('\n')}\n`;
  }

  private increment(name: string, labels: Labels = {}): void {
    this.assertName(name);
    const samples = this.counters.get(name) ?? new Map<string, Sample>();
    const key = labelsKey(labels);
    const sample = samples.get(key) ?? { labels, value: 0 };
    sample.value += 1;
    samples.set(key, sample);
    this.counters.set(name, samples);
  }

  private addGauge(name: string, change: number, labels: Labels = {}): void {
    this.assertName(name);
    const samples = this.gauges.get(name) ?? new Map<string, Sample>();
    const key = labelsKey(labels);
    const sample = samples.get(key) ?? { labels, value: 0 };
    sample.value = Math.max(0, sample.value + change);
    samples.set(key, sample);
    this.gauges.set(name, samples);
  }

  private setGauge(name: string, value: number, labels: Labels = {}): void {
    this.assertName(name);
    const samples = this.gauges.get(name) ?? new Map<string, Sample>();
    samples.set(labelsKey(labels), { labels, value: Math.max(0, value) });
    this.gauges.set(name, samples);
  }

  private observe(name: string, value: number, labels: Labels = {}): void {
    this.assertName(name);
    const samples = this.summaries.get(name) ?? new Map<string, SummarySample>();
    const key = labelsKey(labels);
    const sample = samples.get(key) ?? { count: 0, labels, value: 0 };
    sample.count += 1;
    sample.value += Math.max(0, value);
    samples.set(key, sample);
    this.summaries.set(name, samples);
  }

  private assertName(name: string): void {
    if (!metricName.test(name)) throw new Error('Invalid operational metric name');
  }
}
