const { withAppBuildGradle } = require('expo/config-plugins');

const PROJECT_ROOT_LINE =
  'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()';

const WORKLETS_GRADLE_PATH_FIX = `
def reactNativeWorkletsProject = rootProject.findProject(":react-native-worklets")
if (reactNativeWorkletsProject != null) {
    ext.REACT_NATIVE_WORKLETS_NODE_MODULES_DIR = reactNativeWorkletsProject.projectDir.parentFile.absolutePath
}`;

function withReactNativeWorkletsGradlePath(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes('REACT_NATIVE_WORKLETS_NODE_MODULES_DIR')) {
      return mod;
    }

    mod.modResults.contents = mod.modResults.contents.replace(
      PROJECT_ROOT_LINE,
      `${PROJECT_ROOT_LINE}\n${WORKLETS_GRADLE_PATH_FIX}`,
    );

    return mod;
  });
}

module.exports = withReactNativeWorkletsGradlePath;
