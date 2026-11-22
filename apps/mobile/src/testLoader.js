export async function resolve(specifier, context, nextResolve) {
  if (specifier === "react-native") {
    return {
      url: new URL("./reactNativeStub.js", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.endsWith(".js")) {
    return nextResolve(`${specifier}.js`, context);
  }
  return nextResolve(specifier, context);
}
