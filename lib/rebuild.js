const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const codebuild = new AWS.CodeBuild()
const build = require('./build')
const rebuild_key = process.env.REBUILD_KEY

module.exports.run = (key, buildId) => {
  return new Promise((resolve, reject) => {
    if(rebuild_key && key !== rebuild_key) return reject('Invalid key')
    fetchBuild(buildId)
      .then(previousBuild => {
        if(previousBuild.buildStatus != 'FAILED') {
          reject('Build did not fail, cannot rebuild')
        } else {
          // Rebuild
          const environmentVariables = previousBuild.environment.environmentVariables
          const deployEnvironment = findObjectByName(environmentVariables, 'DEPLOY_ENVIRONMENT').value
          const committer = findObjectByName(environmentVariables, 'COMMITTER').value
          const branch = findObjectByName(environmentVariables, 'BRANCH').value
          const reviewEnvironment = findObjectByName(environmentVariables, 'REVIEW_ENVIRONMENT').value

          build.run(previousBuild.sourceVersion, deployEnvironment, committer, branch, reviewEnvironment)
            .then(resp => {
              resolve(resp)
            })
            .catch(err => {
              reject(err)
            })
        }
      })
      .catch(err => {
        console.log(err)
        reject(err)
      })
  })
}

const fetchBuild = (buildId) => {
  return new Promise((resolve, reject) => {
    codebuild.batchGetBuilds({
      ids: [ buildId ]
    }, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data.builds[0])
      }
    })
  })
}

const findObjectByName = (objects, name) => {
  return objects.find(object => object.name === name)
}
