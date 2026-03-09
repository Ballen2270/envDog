const inquirer = require('inquirer');

function createEscCancelError() {
  const err = new Error('操作已取消 (q)');
  err.code = 'USER_CANCELLED';
  return err;
}

function isEscCancelError(error) {
  return !!error && (error.code === 'ESC_CANCELLED' || error.code === 'USER_CANCELLED');
}

function promptWithEscCancel(questions) {
  const promptPromise = inquirer.prompt(questions);
  const ui = promptPromise.ui;

  if (!ui || !ui.rl || !ui.rl.input || typeof ui.rl.input.on !== 'function') {
    return promptPromise;
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    const input = ui.rl.input;

    const cleanup = () => {
      if (input && typeof input.off === 'function') {
        input.off('keypress', onKeypress);
        input.off('data', onData);
      } else if (input && typeof input.removeListener === 'function') {
        input.removeListener('keypress', onKeypress);
        input.removeListener('data', onData);
      }
    };

    const cancel = () => {
      if (finished) return;
      finished = true;
      cleanup();
      try {
        ui.close();
      } catch (_) {
        // ignore
      }
      reject(createEscCancelError());
    };

    const onKeypress = (_char, key) => {
      if (key && (key.name === 'q' || key.name === 'Q')) {
        cancel();
      }
    };

    const onData = (chunk) => {
      if (finished || chunk == null) return;
      const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (str === 'q' || str === 'Q') {
        cancel();
      }
    };

    input.on('keypress', onKeypress);
    input.on('data', onData);

    promptPromise.then((answers) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(answers);
    }).catch((error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    });
  });
}

module.exports = {
  promptWithEscCancel,
  isEscCancelError
};
