const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const codebuild = new AWS.CodeBuild()
const status = require('./status')

module.exports.run = (commit, environment, committer, branch, reviewEnvironment) => {
  return new Promise((resolve, reject) => {
    const imageOverride = checkImageOverride(branch)
    var params = {
      projectName: process.env.CODEBUILD_PROJECT,
      environmentVariablesOverride: [
        {
          name: 'BRANCH',
          value: branch
        },
        {
          name: 'COMMITTER',
          value: committer
        },
        {
          name: 'DEPLOY_ENVIRONMENT',
          value: environment === undefined ? '' : environment
        },
        {
          name: 'REVIEW_ENVIRONMENT',
          value: `${reviewEnvironment}`
        }
      ],
      sourceVersion: commit
    }

    if(imageOverride) {
      params.imageOverride = imageOverride
    }

    codebuild.startBuild(params)
      .promise()
      .then(resp => {
        return status.update('pending', 'CodeBuild is running your tests', commit, resp.build.id)
      })
      .then(resp => {
        resolve(resp)
      })
      .catch(err => {
        console.log(err)
        reject(err)
      })
  })
}

const checkImageOverride = (branch) => {
  const imageOverrides = JSON.parse(process.env.BRANCH_IMAGE_OVERRIDE)
  const imageOverride = imageOverrides.find(function(override) {
    return override.branches.includes(branch)
  })

  if(imageOverride) return imageOverride.image
}
