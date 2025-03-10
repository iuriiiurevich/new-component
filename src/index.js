#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';

import {
  getConfig,
  buildPrettifier,
  createParentDirectoryIfNecessary,
  logIntro,
  logItemCompletion,
  logConclusion,
  logError,
} from './helpers.js';
import {
  mkDirPromise,
  readFilePromiseRelative,
  writeFilePromise,
  formatComponentName,
} from './utils.js';

const program = new Command();

// Get the default config for this component (looks for local/global overrides,
// falls back to sensible defaults).
const config = await getConfig();

// Convenience wrapper around Prettier, so that config doesn't have to be
// passed every time.
const prettify = await buildPrettifier(config.prettierConfig);

program
  .arguments('<componentName>')
  .option(
    '-l, --lang <language>',
    'Which language to use (default: "js")',
    /^(js|ts)$/i,
    config.lang,
  )
  .option(
    '-d, --dir <pathToDirectory>',
    'Path to the "components" directory (default: "src/components")',
    config.dir,
  )
  .option(
    '-c, --case <caseFormat>',
    'File and directory name case format: "pascal" or "kebab" (default: "pascal")',
    /^(pascal|kebab)$/i,
    config.fileNameCase,
  )
  .parse(process.argv);

const [componentName] = program.args;

const options = program.opts();

// For file/directory names, we use the configured case format
const fileName = formatComponentName(componentName, options.case);

const fileExtension = options.lang === 'js' ? 'jsx' : 'tsx';
const indexExtension = options.lang === 'js' ? 'js' : 'ts';

// Find the path to the selected template file.
const templatePath = `./templates/${options.lang}.jsx`;

// Get all of our file paths worked out, for the user's project.
const componentDir = `${options.dir}/${fileName}`;
const filePath = `${componentDir}/${fileName}.${fileExtension}`;
const indexPath = `${componentDir}/index.${indexExtension}`;

// Our index template is super straightforward, so we'll just inline it for now.
const indexTemplate = await prettify(`\
export * from './${fileName}';
`);

logIntro({
  name: componentName,
  dir: componentDir,
  lang: options.lang,
  case: options.case,
});

// Check if componentName is provided
if (!componentName) {
  logError(`Sorry, you need to specify a name for your component like this: new-component <n>`);
  process.exit(0);
}

// Check if componentName is in PascalCase
if (!/^[A-Z][a-zA-Z0-9]*$/.test(componentName)) {
  logError(
    `Component name must be in PascalCase format. Example: "MyComponent", not "myComponent" or "my-component".`,
  );
  process.exit(0);
}

// Check to see if the parent directory exists.
// Create it if not
createParentDirectoryIfNecessary(options.dir);

// Check to see if this component has already been created
const fullPathToComponentDir = path.resolve(componentDir);
if (fs.existsSync(fullPathToComponentDir)) {
  logError(
    `Looks like this component already exists! There's already a component at ${componentDir}.\nPlease delete this directory and try again.`,
  );
  process.exit(0);
}

// Start by creating the directory that our component lives in.
mkDirPromise(componentDir)
  .then(() => readFilePromiseRelative(templatePath))
  .then((template) => {
    logItemCompletion('Directory created.');
    return template;
  })
  .then((template) =>
    // Replace our placeholders with real data (so far, just the component name)
    template.replace(/COMPONENT_NAME/g, componentName),
  )
  .then(async (template) =>
    // Format it using prettier, to ensure style consistency, and write to file.
    writeFilePromise(filePath, await prettify(template)),
  )
  .then((template) => {
    logItemCompletion('Component built and saved to disk.');
    return template;
  })
  .then(async (template) =>
    // We also need the `index.js` file, which allows easy importing.
    writeFilePromise(indexPath, await prettify(indexTemplate)),
  )
  .then((template) => {
    logItemCompletion('Index file built and saved to disk.');
    return template;
  })
  .then((template) => {
    logConclusion();
  })
  .catch((err) => {
    console.error(err);
  });
