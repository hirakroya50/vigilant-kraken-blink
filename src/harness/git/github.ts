import { Octokit } from "@octokit/rest";
import { checkSchema, shaSchema } from "../contracts/index.js";
import type { z } from "zod";
import type { Lease } from "../coordination/lease.js";
export class GitHub {
  readonly api: Octokit;
  readonly owner: string;
  readonly repo: string;
  constructor(repository: string, token: string) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) throw new Error("Expected authorized GITHUB_REPOSITORY=owner/repo and GITHUB_TOKEN.");
    [this.owner, this.repo] = repository.split("/");
    this.api = new Octokit({ auth: token, userAgent: "safi-product-008" });
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
    const check = checkSchema.parse(input);
    await lease.assertOwned();
    const existing = (await this.checks(check.sha)).find(c => c.external_id === check.evidenceId && c.name === check.name && c.status === "completed");
    if (existing) {
      if (existing.conclusion !== check.conclusion || existing.output.summary !== check.summary) throw new Error("Evidence identity already has different content.");
      return existing.html_url;
    }
    await lease.assertOwned();
    const response = await this.api.checks.create({ owner: this.owner, repo: this.repo, name: check.name, head_sha: check.sha, external_id: check.evidenceId, status: "completed", conclusion: check.conclusion, completed_at: new Date().toISOString(), output: { title: check.title, summary: check.summary } });
    return response.data.html_url;
  }
}
