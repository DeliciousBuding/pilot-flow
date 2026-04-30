export interface QualitySignal {
  key: string;
  severity: string;
  evidence: string;
}

export interface ImprovementProposal {
  area: string;
  proposal: string;
  evidence: string;
}

export interface WorkerRequest {
  runId: string;
  workerType: "review" | string;
  objective: string;
  inputs: {
    retrospective?: {
      qualitySignals?: QualitySignal[];
      improvementProposals?: ImprovementProposal[];
    };
    eval?: {
      status?: string;
      summary?: {
        passed: number;
        failed: number;
        total: number;
      };
    };
  };
  allowedTools: string[];
  outputContract: "preview-only" | string;
  riskLevel: "low" | "medium" | "high" | string;
}

export interface WorkerArtifact {
  type: "worker_review";
  title: string;
  status: "preview";
  metadata: {
    qualitySignalCount: number;
    proposalCount: number;
    evalStatus: string;
    allowedTools: string[];
  };
}

export interface ProposedFeishuWrite {
  target: "doc";
  title: string;
  body: string;
  confirmed: false;
}

export interface WorkerResult {
  status: "completed";
  summary: string;
  artifacts: WorkerArtifact[];
  proposedFeishuWrites: ProposedFeishuWrite[];
  risks: string[];
  nextConfirmation: string;
}

export async function runReviewWorker(request: WorkerRequest): Promise<WorkerResult> {
  if (request.workerType !== "review") {
    throw new Error("runReviewWorker only handles review worker requests.");
  }

  if (request.outputContract !== "preview-only") {
    throw new Error("runReviewWorker requires a preview-only output contract.");
  }

  const qualitySignals = request.inputs.retrospective?.qualitySignals ?? [];
  const improvementProposals = request.inputs.retrospective?.improvementProposals ?? [];
  const evalStatus = request.inputs.eval?.status ?? "unknown";
  const summary = [
    `Review worker found ${qualitySignals.length} quality signals`,
    `${improvementProposals.length} improvement proposals`,
    `and eval status ${evalStatus}.`,
  ].join(", ");

  return {
    status: "completed",
    summary,
    artifacts: [
      {
        type: "worker_review",
        title: `Review Worker Preview for ${request.runId}`,
        status: "preview",
        metadata: {
          qualitySignalCount: qualitySignals.length,
          proposalCount: improvementProposals.length,
          evalStatus,
          allowedTools: request.allowedTools,
        },
      },
    ],
    proposedFeishuWrites: [
      {
        target: "doc",
        title: `PilotFlow Review: ${request.runId}`,
        body: renderPreviewBody(request, summary),
        confirmed: false,
      },
    ],
    risks: buildRisks(request, qualitySignals.length, evalStatus),
    nextConfirmation: "Review proposed Feishu write before publishing.",
  };
}

function buildRisks(request: WorkerRequest, qualitySignalCount: number, evalStatus: string): string[] {
  const risks: string[] = [];

  if (evalStatus === "failed") {
    risks.push("This run has failed eval cases before publishing.");
  }

  if (request.riskLevel !== "low") {
    risks.push(`Worker request risk level is ${request.riskLevel}.`);
  }

  if (qualitySignalCount > 0) {
    risks.push("Quality signals require human review before workflow changes.");
  }

  return risks;
}

function renderPreviewBody(request: WorkerRequest, summary: string): string {
  const evalSummary = request.inputs.eval?.summary;
  const evalLine = evalSummary
    ? `Eval: ${evalSummary.passed}/${evalSummary.total} passed, ${evalSummary.failed} failed.`
    : "Eval: no summary provided.";

  return [
    `# PilotFlow Review Preview`,
    ``,
    `Run: ${request.runId}`,
    `Objective: ${request.objective}`,
    ``,
    summary,
    evalLine,
    ``,
    `This is a preview-only worker output. It must be reviewed before any Feishu write is published.`,
  ].join("\n");
}
