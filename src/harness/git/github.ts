import { Octokit } from "@octokit/rest";
import { checkSchema, shaSchema } from "../contracts/index.js";
import type { z } from "zod";
import type { Lease } from "../coordination/lease.js";
export class GitHub {
  readonly api: Octokit;
  readonly owner: string;
  readonly repo: string;
  constructor(repository: string, token: string | Octokit, private readonly verifyAuthority?: () => Promise<{ appId: number }>) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) throw new Error("Expected authorized repository and authentication.");
    [this.owner, this.repo] = repository.split("/");
    this.api = typeof token === "string" ? new Octokit({ auth: token, userAgent: "safi-product-008", request: { timeout: 15000 } }) : token;
    if (typeof token === "string" && verifyAuthority) throw new Error("PAT authentication cannot publish trusted checks.");
  }
  async discover() {
    const prs = await this.api.paginate(this.api.pulls.list, { owner: this.owner, repo: this.repo, state: "open", per_page: 100 });
    return prs.filter(pr => pr.head.repo?.full_name === `${this.owner}/${this.repo}` && /^work\/[a-z0-9-]+$/.test(pr.head.ref)).map(pr => ({ number: pr.number, branch: pr.head.ref, sha: shaSchema.parse(pr.head.sha), draft: pr.draft ?? false, url: pr.html_url }));
  }
  async head(branch: string) {
    if (!/^work\/[a-z0-9-]+$/.test(branch) && branch !== "main") throw new Error("Invalid work branch.");
    const response = await this.api.git.getRef({ owner: this.owner, repo: this.repo, ref: `heads/${branch}` });
    return shaSchema.parse(response.data.object.sha);
  }
  async checks(sha: string) {
    shaSchema.parse(sha);
    const checks = await this.api.paginate(this.api.checks.listForRef, { owner: this.owner, repo: this.repo, ref: sha, per_page: 100 });
    return checks.filter(check => check.head_sha === sha);
  }
  async publish(input: z.infer<typeof checkSchema>, lease: Lease) {
    if (!this.verifyAuthority) throw new Error("Trusted publication requires verified GitHub App authentication; discovery PAT is read-only.");
    const check = checkSchema.parse(input);
    const identity = await this.verifyAuthority();
    await lease.assertOwned();
    const existing = (await this.checks(check.sha)).find(c => c.app?.id === identity.appId && c.external_id === check.evidenceId && c.name === check.name && c.status === "completed");
    if (existing) {
      if (existing.conclusion !== check.conclusion || existing.output.summary !== check.summary) throw new Error("Evidence identity already has different content.");
      return existing.html_url;
    }
    if ((await this.verifyAuthority()).appId !== identity.appId) throw new Error("Publication App identity changed.");
    await lease.assertOwned();
    const response = await this.api.checks.create({ owner: this.owner, repo: this.repo, name: check.name, head_sha: check.sha, external_id: check.evidenceId, status: "completed", conclusion: check.conclusion, completed_at: new Date().toISOString(), output: { title: check.title, summary: check.summary } });
    if (response.data.app?.id !== identity.appId || response.data.head_sha !== check.sha) throw new Error("Published check identity mismatch; reconcile remote truth before retrying.");
    return response.data.html_url;
  }
}
