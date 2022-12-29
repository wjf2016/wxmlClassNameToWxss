import * as vscode from "vscode";
import completionItemProvider from "./completion-item-provider";
import symbolProvider from "./symbol-provider";

export function activate(context: vscode.ExtensionContext): void {
  completionItemProvider(context);
  symbolProvider(context);
  console.log("wxml-class-name-to-wxss 插件已激活");
}

// this method is called when your extension is deactivated
// export function deactivate() {}
