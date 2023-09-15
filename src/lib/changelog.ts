import { Octokit } from '@octokit/rest';
import { Config, PullRequest } from './types';

const PULL_REQUEST_STATE = 'closed';
const RESULTS_PER_PAGE = 100;

export class Changelog {
    private commits: Array<string>;
    private commitPage: number;
    private config: Config;
    private latestTagsCommit: string;
    private octokit: Octokit;
    private pullRequests: Array<PullRequest>;
    private pullRequestPage: number;
    private branch: string;
    private title: string;
    private prefix: string;
    private changelogBody: string;

    public constructor(config: Config) {
        this.commits = [];
        this.commitPage = 0;
        this.config = config;
        this.latestTagsCommit = '';
        this.octokit = new Octokit({
            auth: config.githubToken,
        });
        this.pullRequests = [];
        this.pullRequestPage = 0;
        this.branch = '';
        this.title = config.title;
        this.prefix = config.prefix;
        this.changelogBody = '';
    }

    /**
     * Get changelog from title and changelog body
     */
    public get changelog(): string {
        return `${this.title}\n${this.changelogBody}`;
    }

    /**
     * Check if changelog is empty
     */
    public get isEmpty(): boolean {
        if (this.changelogBody) return false;
        return true;
    }

    /**
     * Run main logic
     */
    public async run(): Promise<void> {
        await this.setBranch();
        await this.getLatestRelease();
        await this.getCommits();
        await this.getPullRequests();
        await this.generateChangelog();
    }

    /**
     * Set default branch used in getCommits and getPullRequests
     */
    private async setBranch(): Promise<void> {
        if (!this.branch) {
            const repository: any = await this.octokit.rest.repos.get({
                owner: this.config.owner,
                repo: this.config.repo,
            });
            this.branch = repository.default_branch;
        }
    }

    /**
     * Get latest release and it's commit.
     * TODO: fails if there is no release
     */
    private async getLatestRelease(): Promise<void> {
        const release = await this.octokit.rest.repos.getLatestRelease({
            owner: this.config.owner,
            repo: this.config.repo,
        });
        const tagName = release.data.tag_name;
        // We do not assume we would not find latest release tag, otherwise something
        // is really wrong with github
        for (let page = 0;; page++) {
            const releasesTag = (await this.getTags(page)).filter((tag) => tag.name === tagName);
            if (releasesTag.length === 1) {
                this.latestTagsCommit = releasesTag[0].commitSha;
                break;
            }
        }
    }

    /**
     * Get tags
     */
    private async getTags(page: number): Promise<Array<{name: string, commitSha: string}>> {
        const tags = await this.octokit.rest.repos.listTags({
            owner: this.config.owner,
            repo: this.config.repo,
            per_page: RESULTS_PER_PAGE,
            page: page,
        });

        return tags.data.map((tag) => {
            return { name: tag.name, commitSha: tag.commit.sha };
        });
    }

    /**
     * Get commits. This function is not idempotent as with each call it increments page parameter.
     */
    private async getCommits(): Promise<void> {
        const rawCommits: any = await this.octokit.rest.repos.listCommits({
            owner: this.config.owner,
            repo: this.config.repo,
            sha: this.branch,
            per_page: RESULTS_PER_PAGE,
            page: this.commitPage,
        });
        const commits: Array<string> = rawCommits.data.map((commit: any) => commit.sha);
        this.commits = this.commits.concat(commits);
        this.commitPage++;
    }

    /**
     * Get pull requests. This function is not idempotent as with each call it increments page parameter.
     */
    private async getPullRequests(): Promise<void> {
        const rawPullRequests: any = await this.octokit.rest.pulls.list({
            owner: this.config.owner,
            repo: this.config.repo,
            base: this.branch,
            state: PULL_REQUEST_STATE,
            per_page: RESULTS_PER_PAGE,
            page: this.pullRequestPage,
        });
        const mergedPullRequests: any = rawPullRequests.data.filter(
            (pullRequest: any) => pullRequest.merged_at,
        );

        const pullRequests: Array<PullRequest> = mergedPullRequests.map(
            (pullRequest: any) => {
                return {
                    url: pullRequest.html_url,
                    title: pullRequest.title,
                    commitSha: pullRequest.merge_commit_sha,
                };
            }
        );

        this.pullRequests = this.pullRequests.concat(pullRequests);
        this.pullRequestPage++;
    }

    /**
     * Creates changelog body from pull request titles
     */
    private async generateChangelog(): Promise<void> {
        let changelogBody = '';
        let indexOfTag: number;

        // If index not found fetch more commits
        for(;;) {
            indexOfTag = this.commits.indexOf(this.latestTagsCommit);
            if (indexOfTag === -1) {
                await this.getCommits();
            } else {
                break;
            }
        }

        for(let i = 0;; i++) {
            const indexOfPullRequest = this.commits.indexOf(this.pullRequests[i].commitSha);
            if (indexOfPullRequest === -1 || indexOfPullRequest >= indexOfTag) {
                break;
            } else if (i === this.pullRequests.length -1) {
                await this.getPullRequests();
            } else {
                changelogBody += `${this.prefix} ${this.pullRequests[i].title}\n`;
            }
        }
        this.changelogBody = changelogBody;
    }
}
