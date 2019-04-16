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
  if (event.Records) {
    const message = JSON.parse(event.Records[0].Sns.Message)
    // Message from SNS CodeBuild, reporting stuff
    report.run(message.buildId)
      .then(resp => {
        callback(null, resp);
      })
      .catch(err => {
        callback(err, null);
      })
  } else if (event.buildId) {
      // Rebuild from Slack
      rebuild.run(event.key, event.buildId)
        .then(resp => {
          callback(null, {
            statusCode: 302,
            location: resp.target_url
          })
        })
        .catch(err => {
          callback(null, {
            statusCode: 500
          })
        })
    } else {
      // From Github
      const message = JSON.parse(event.body);

      if(message && message.pull_request) {
        // payload is from pr events
        if (message.action == "opened" || message.action == "reopened") {
          // only build for pr opened and reopened events
          var branch = message.pull_request.head.ref

          if(branchesToExclude.includes(branch)) return console.log(`Not building ${branch}, exiting.`)

          build.run(message.pull_request.head.sha, branchEnvironments[branch], message.pull_request.user.login, branch, false)
            .then(resp => {
              callback(null, {"statusCode": 200, "body": JSON.stringify(resp)})
            })
            .catch(err => {
              callback(new Error("build wasn't triggered"))
            })
        }
      } else {
        if(message && message.after) {
          // payload is from push events
          if(message.deleted) return console.log('Branch deleted, exiting.')

          var branch = message.ref.replace('refs/heads/','')
          var commitMessage = message.head_commit.message

          if(branchesToExclude.includes(branch)) return console.log(`Not building ${branch}, exiting.`)

          build.run(message.after, branchEnvironments[branch], message.pusher.name, branch, buildReviewEnvironment(branch, commitMessage))
            .then(resp => {
              callback(null, {"statusCode": 200, "body": JSON.stringify(resp)})
            })
            .catch(err => {
              callback(new Error("build wasn't triggered"))
            })
        }
      }
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
