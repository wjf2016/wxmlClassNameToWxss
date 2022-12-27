import * as vscode from "vscode";
import completion from "./completion";

export function activate(context: vscode.ExtensionContext): void {
  completion(context);
  console.log("wxml-class-name-to-wxss 插件已激活");
}

// this method is called when your extension is deactivated
// export function deactivate() {}
