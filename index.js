'use strict'

const build = require('./lib/build')
const rebuild = require('./lib/rebuild')
const report = require('./lib/report')

const branchesToExclude = []
const branchEnvironments = {
  'master': 'production',
  'staging': 'staging'
}
const reviewEnvironmentBranchesToExclude = ['staging', 'master']
const reviewEnvironmentTrigger = '[review]'

exports.handler = (event, context, callback) => {
  if(event.Records) {
    const message = JSON.parse(event.Records[0].Sns.
      Message)

    if(message && message.after) {
      // Message from GitHub, building
      const branch = message.ref.replace('refs/heads/','')
      const commitMessage = message.head_commit.message

      if(branchesToExclude.includes(branch)) return console.log(`Not building ${branch}, exiting.`)
      if(message.deleted) return console.log('Branch deleted, exiting.')

      build.run(message.after, branchEnvironments[branch], message.pusher.name, branch, buildReviewEnvironment(branch, commitMessage))
        .then(resp => {
          callback(null, resp)
        })
        .catch(err => {
          callback(err, null)
        })
    } else {
      // Message from CodeBuild, reporting
      report.run(message.buildId)
        .then(resp => {
          callback(null, resp);
        })
        .catch(err => {
          callback(err, null);
        })
    }
  } else if (event.buildId) {
    // From API Gateway
    rebuild.run(event.key, event.buildId)
      .then(resp => {
        callback(null, {
          statusCode: 302,
          location: resp.target_url
        })
      })
      .catch(err => {
        callback(err)
      })
  }
}

const buildReviewEnvironment = (branch, commitMessage) => {
  if(checkReviewEnvironmentBranchName(branch)) return false
  if(reviewEnvironmentBranchesToExclude.includes(branch)) return false
  return commitMessage.includes(reviewEnvironmentTrigger)
}

const checkReviewEnvironmentBranchName = (branch) => {
  // NOTE: The branch name has to be FQDN compatible for letsencrypt so check that here
  const invalidReviewEnvironmentBranchChars = ['_', '/']
  return invalidReviewEnvironmentBranchChars.some( function(char) { return branch.includes(char) })
}
