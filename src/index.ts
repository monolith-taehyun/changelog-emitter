import * as dotenv from 'dotenv';
import * as core from '@actions/core';
import { Config } from './lib/types';
import { Changelog } from "./lib/changelog";

dotenv.config();

const {
    GITHUB_REPOSITORY,
    GITHUB_TOKEN,
} = process.env;

const getConfig = (): Config => {
    const branch = core.getInput('branch') || '';
    const title = core.getInput('title') || new Date().toISOString().split('T')[0].replace(/-/g, '/');
    const prefix = core.getInput('prefix') || '-';
    const githubToken = core.getInput('github_token') || GITHUB_TOKEN;
    let owner = core.getInput('owner');
    let repo = core.getInput('repo');

    if (GITHUB_REPOSITORY && (!owner || !repo)) {
        const ownerAndRepo: Array<string> = GITHUB_REPOSITORY.split('/');
        owner = ownerAndRepo[0];
        repo = ownerAndRepo[1];
    } else {
        throw new Error(`Either GITHUB_REPOSITORY environment variable or "owner" and "repo" input must be set.`);
    }

    if (!githubToken) {
        throw new Error('Either GITHUB_TOKEN environment variable or "github_token" input must be set.');
    }

    return {
        branch,
        title,
        prefix,
        githubToken,
        owner,
        repo,
    };
};

(async () => {
    try {
        core.info('Starting...');
        const config: Config = await getConfig();
        const changelog: Changelog = new Changelog(config);
        await changelog.run();
        const changelogContent = changelog.changelog;
        core.info(`Changelog:\n${changelogContent}`);
        core.setOutput('changelog', changelogContent);
        core.setOutput('isEmpty', changelog.isEmpty);
        core.exportVariable('CHANGELOG', changelogContent);
        core.exportVariable('IS_EMPTY', changelog.isEmpty);
        core.info('Finished!');
    } catch (error) {
        core.setFailed(`Failed to generate changelog due to: ${error}`);
    }
})();
