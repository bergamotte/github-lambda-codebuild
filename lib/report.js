const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const codebuild = new AWS.CodeBuild()
const status = require('./status')
const promiseRetry = require('promise-retry')
const Slack = require('slack-node')

const statuses = {
  'PENDING': 'pending',
  'IN_PROGRESS': 'pending',
  'FAILED': 'failure',
  'SUCCEEDED': 'success',
  'ERROR': 'error'
}

const messages = {
  'PENDING': 'CodeBuild is running your tests',
  'IN_PROGRESS': 'CodeBuild is running your tests',
  'FAILED': 'Your tests failed on CodeBuild',
  'SUCCEEDED': 'Your tests passed on CodeBuild',
  'ERROR': 'There was an error running your tests'
}

const greenStatus = (buildId) => {
  return new Promise((resolve, reject) => {
    codebuild.batchGetBuilds({ ids: [ buildId ] }, (err, data) => {
      var build = data.builds[0]
      if (build.buildStatus == 'SUCCEEDED' || build.buildStatus == 'FAILED') {
        resolve(build)
      } else {
        reject(false)
      }
    })
  })
}

const reportFailure = (buildId, build) => {
  const branch = getBranch(build)
  const branchesToGenericReport = ['staging', 'master']
  const buildFailed = (build.buildStatus === 'FAILED')
  const committer = getCommitter(build)
  const failureSnsTopic = process.env.FAILURE_SNS_TOPIC
  const githubToSlackUsernames = process.env.GITHUB_SLACK_USERNAMES || '{}'
  const slackWebhookUrl = process.env.SLACK_URL
  const slackWebhookUser = process.env.SLACK_USERNAME

  var failureMessage
  var slackChannel = process.env.SLACK_CHANNEL

  if(buildFailed) {
    const committerSlackUsername = JSON.parse(githubToSlackUsernames)[committer]

    if(committerSlackUsername && !branchesToGenericReport.includes(branch)) {
      slackChannel = `@${committerSlackUsername}`
      failureMessage = buildFailureMessage(buildId, branch)
    } else {
      failureMessage = buildFailureMessage(buildId, branch, committer)
    }

    if(slackWebhookUrl) reportFailureToSlack(slackChannel, slackWebhookUrl, slackWebhookUser, failureMessage)
  }
}

const reportFailureToSlack = (channel, webhookUrl, webhookUser, message) => {
  slack = new Slack();
  slack.setWebhook(webhookUrl);

  return new Promise((resolve, reject) => {
    slack.webhook({
      attachments: [message],
      channel: channel,
      icon_emoji: ':red_circle:',
      unfurl_links: false,
      unfurl_media: false,
      username: webhookUser || 'buildbot'
    }, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

const buildFailureMessage = (buildId, branch, committer) => {
  const buildUrl = `https://console.aws.amazon.com/codebuild/home?region=${process.env.AWS_REGION}#/builds/${buildId}/view/new`
  var message = `<${buildUrl}|See more>`
  var output = {}
  var rebuildUrl

  if(process.env.REBUILD_URL && process.env.REBUILD_KEY) {
    rebuildUrl = `${process.env.REBUILD_URL}?buildId=${buildId}&key=${process.env.REBUILD_KEY}`
    message += ` or <${rebuildUrl}|Rebuild>`
  }

  if(committer) {
    // Generic global notification
    return {
      "title": "Build failed",
      "color": "danger",
      "fields": [
        {
          "title": "Build ID",
          "value": buildId,
        },
        {
          "title": "Branch",
          "value": branch,
          "short": true
        },
        {
          "title": "Committer",
          "value": committer,
          "short": true
        },
        {
          "value": message
        }
      ]
    }
  } else {
    // Specific user notification
    return {
      "title": "Your build failed",
      "color": "danger",
      "fields": [
        {
          "title": "Build ID",
          "value": buildId,
        },
        {
          "title": "Branch",
          "value": branch,
          "short": true
        },
        {
          "value": message
        }
      ]
    }
  }
}

const getBranch = (build) => {
  const branchEnvVar = build.environment.environmentVariables.find((environmentVariable) => {
    return environmentVariable.name === 'BRANCH'
  })

  return branchEnvVar ? branchEnvVar.value : '(branch unavailable)'
}

const getCommitter = (build) => {
  const committerEnvVar = build.environment.environmentVariables.find((environmentVariable) => {
    return environmentVariable.name === 'COMMITTER'
  })

  return committerEnvVar ? committerEnvVar.value : '(committer unavailable)'
}

module.exports.run = (buildId) => {
  return promiseRetry((retry, number) => {
    console.log('attempt number', number);
    return greenStatus(buildId)
      .catch(retry);
  }).then(build => {
      const buildStatus = statuses[build.buildStatus]
      const buildMessage = messages[build.buildStatus]

      reportFailure(buildId, build)

      return status.update(buildStatus, buildMessage, build.sourceVersion, build.id)
    }, (err) => {
      return err
    })
}
