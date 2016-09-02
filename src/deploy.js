// npm packages
import _ from 'lodash';
import chalk from 'chalk';
import got from 'got';
import inquirer from 'inquirer';

// our packages
import config from './config';
import {handleError} from './error';
import {getImages} from './list';
import {labelArrayFromString, commaStringToArray} from './util';

const processLabels = (labels) => labels
  .filter(l => l !== undefined)
  .map(l => {
    const [k, v] = l.split('=');
    if (!k || !v) {
      return undefined;
    }
    return {key: k, value: v};
  }).filter(l => l !== undefined);

export default (yargs) =>
  yargs.command('deploy [image]', 'deploy image on exoframe server', {
    ports: {
      alias: 'p',
    },
    labels: {
      alias: 'l',
    },
    env: {
      alias: 'e',
    },
    noninteractive: {
      alias: 'ni',
    },
  }, async ({image: userImage, ports: textPorts, labels: textLabels, env: textEnv, noninteractive}) => {
    let image = userImage;
    if (!image) {
      const images = await getImages();
      const {inImage} = await inquirer.prompt({
        type: 'list',
        name: 'inImage',
        message: 'Chose image to deploy:',
        choices: images,
      });
      image = inImage;
    }

    console.log(chalk.bold('Deploying:'), image, 'on', config.endpoint);
    // convert ports and labels to needed formats
    let ports = (Array.isArray(textPorts) ? textPorts : [textPorts]).filter(l => l !== undefined);
    let labels = processLabels(Array.isArray(textLabels) ? textLabels : [textLabels]);
    let env = (Array.isArray(textEnv) ? textEnv : [textEnv]).filter(e => e !== undefined);

    // ask user about config if we're interactive
    if (!noninteractive) {
      // get user custom tag
      const {inPorts, inLabels, inEnv} = await inquirer
      .prompt([{
        type: 'input',
        name: 'inPorts',
        message: 'Port mappings (comma separated):',
      }, {
        type: '',
        name: 'inLabels',
        message: 'Custom labels (comma separated):',
      }, {
        type: '',
        name: 'inEnv',
        message: 'Environment variables (comma separated):',
      }]);
      // assign ports
      ports = commaStringToArray(inPorts) || ports;
      // assign labels
      const userLabels = labelArrayFromString(inLabels);
      labels = userLabels ? processLabels(userLabels) : labels;
      // assign env vars
      env = commaStringToArray(inEnv) || env;
    }

    // send request
    const options = {
      headers: {
        'x-access-token': config.token,
        'Content-type': 'application/json',
      },
      body: JSON.stringify({
        services: [{name: image, ports, labels, env}],
      }),
      json: true,
    };
    const remoteUrl = `${config.endpoint}/api/deploy`;
    try {
      const {body} = await got.post(remoteUrl, options);
      // check for errors
      if (!body || !body.length) {
        throw new Error('Error deploying!');
      }
      console.log(chalk.green('Successfully deployed!'));
      body.forEach((container, i) => {
        console.log(chalk.bold(`${i + 1})`), 'Container with ID:', container.id);
      });
    } catch (e) {
      // try generic error handling first
      if (handleError(e)) {
        return;
      }

      // log other errors
      console.log(chalk.red('Error deploying!'));
      console.error(e);
    }
  });
