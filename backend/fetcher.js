'use strict';

import fetch from 'isomorphic-fetch';
import sleep from 'sleep-promise';
import parseGitHubURL from 'github-url-to-object';

const FETCH_TIMEOUT = 3 * 60 * 1000; // 3 minutes

export class Fetcher {
  constructor({ context } = {}) {
    this.context = context;
    this.log = context.log;
    this.store = context.store;
    this.state = context.state;

    this.npmUpdatedPackagesURL = 'http://registry.npmjs.org/-/_view/browseUpdated?group_level=2';
    this.npmWebsitePackageURL = 'https://www.npmjs.com/package/';
    this.npmAPIPackageURL = 'http://registry.npmjs.org/';
    this.gitHubAPIURL = 'https://api.github.com/';
    this.gitHubUsername = 'mvila';
    this.gitHubPersonalAccessToken = '5169f297fa7d627c4b1b5bf1f0e345dbff117198';
  }

  async run() {
    // await this.fetchPackage('webpack-config-json');
    while (true) {
      let startDate = new Date(this.state.lastModificationDate.valueOf() + 1);
      let result = await this.findUpdatedPackages(startDate);
      this.log.notice(`${result.packages.length} updated packages found in npm registry`);
      await this.updatePackages(result.packages);
      if (result.lastDate) {
        this.state.lastModificationDate = result.lastDate;
        await this.state.save();
      }
      await sleep(5 * 60 * 1000); // 5 minutes
    }
  }

  async findUpdatedPackages(startDate) {
    let packages = [];
    let lastDate;
    try {
      let startKey = [startDate];
      let url = this.npmUpdatedPackagesURL;
      url += '&startkey=' + encodeURIComponent(JSON.stringify(startKey));
      let response = await fetch(url, { timeout: FETCH_TIMEOUT });
      if (response.status !== 200) {
        throw new Error(`Bad response from npm registry while fetching updated packages (HTTP status: ${response.status})`);
      }
      let result = await response.json();
      let rows = result.rows;
      for (let row of rows) {
        packages.push(row.key[1]);
        lastDate = new Date(row.key[0]);
      }
    } catch (err) {
      this.log.warning(`An error occured while fetching updated packages from npm registry (${err.message})`);
    }
    return { packages, lastDate };
  }

  async updatePackages(packages) {
    for (let name of packages) {
      let pkg = await this.fetchPackage(name);
      if (!pkg) continue;
      let item = await this.store.Package.getByName(name);
      if (!item) item = new this.store.Package();
      Object.assign(item, pkg);
      let visible = item.determineVisibility(this.log);
      if (item.isNew && !visible) continue;
      if (visible !== item.visible) {
        if (!item.isNew) {
          this.log.info(`'${name}' package visibility changed to ${visible ? 'visible' : 'invisible'}`);
        }
        item.visible = visible;
      }
      let wasNew = item.isNew;
      await item.save();
      this.log.info(`'${name}' package ${wasNew ? 'created' : 'updated'}`);
    }
  }

  async fetchPackage(name) {
    try {
      let ignoredPackage = await this.store.IgnoredPackage.getByName(name);
      if (ignoredPackage) {
        this.log.debug(`'${name}' package ignored`);
        return undefined;
      }

      let npmURL = this.npmWebsitePackageURL + name;

      let url = this.npmAPIPackageURL + name;
      let response = await fetch(url, { timeout: FETCH_TIMEOUT });
      if (response.status !== 200) {
        this.log.warning(`Bad response from npm registry while fetching '${name}' package (HTTP status: ${response.status})`);
        return undefined;
      }
      let npmResult = await response.json();

      let createdOn = npmResult.time && npmResult.time.created && new Date(npmResult.time.created);
      let updatedOn = npmResult.time && npmResult.time.modified && new Date(npmResult.time.modified);

      if (!createdOn) {
        this.log.warning(`'${name}' package doesn't have a creation date`);
        return undefined;
      }
      if (createdOn < this.state.minimumCreationDate) {
        await this.store.IgnoredPackage.put({
          name,
          reason: 'CREATION_DATE_BEFORE_MINIMUM'
        });
        this.log.info(`'${name}' package has been marked as ignored (creation date: ${createdOn.toISOString()})`);
        return undefined;
      }

      let gitHubResult;
      let parsedGitHubURL;
      if (npmResult.repository && npmResult.repository.type === 'git') {
        if (npmResult.repository.url.includes('github')) {
          parsedGitHubURL = parseGitHubURL(npmResult.repository.url);
          if (parsedGitHubURL) {
            gitHubResult = await this.fetchGitHubRepository(parsedGitHubURL);
          } else {
            this.log.debug(`'${name}' package has an invalid GitHub URL (${npmResult.repository.url})`);
          }
        } else {
          this.log.debug(`'${name}' package has a Git respository not hosted by GitHub (${npmResult.repository.url})`);
        }
      } else {
        this.log.debug(`'${name}' package doesn't have a Git respository`);
      }

      return {
        name: npmResult.name,
        description: npmResult.description,
        npmURL,
        gitHubURL: parsedGitHubURL && parsedGitHubURL.https_url,
        createdOn,
        updatedOn,
        npmResult,
        gitHubResult
      };
    } catch (err) {
      this.log.warning(`An error occured while fetching '${name}' package from npm registry (${err.message})`);
      return undefined;
    }
  }

  async fetchGitHubRepository({ user, repo }) {
    try {
      let url = `${this.gitHubAPIURL}repos/${user}/${repo}`;
      let auth = this.gitHubUsername + ':' + this.gitHubPersonalAccessToken;
      auth = new Buffer(auth).toString('base64');
      let response = await fetch(url, {
        headers: {
          Authorization: 'Basic ' + auth
        },
        timeout: FETCH_TIMEOUT
      });
      if (response.status !== 200) {
        this.log.warning(`Bad response from GitHub API while fetching '${user}/${repo}' repository (HTTP status: ${response.status})`);
        return undefined;
      }
      return await response.json();
    } catch (err) {
      this.log.warning(`An error occured while fetching '${user}/${repo}' repository from GitHub API (${err.message})`);
      return undefined;
    }
  }
}

export default Fetcher;
