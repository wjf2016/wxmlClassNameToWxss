import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";
import * as wxmlParser from "@wxml/parser";
import * as wxmlGenerator from "@wxml/generator";

const { parse: wxmlParse } = wxmlParser;
const { traverse } = wxmlGenerator;

import {
  TextDocument,
  SymbolKind,
  ProviderResult,
  SymbolInformation,
  DocumentSymbol,
} from "vscode";

function provideDocumentSymbols(
  document: TextDocument
): ProviderResult<SymbolInformation[] | DocumentSymbol[]> {
  const filePath = document.fileName;

  const wxmlFileContent = fs.readFileSync(filePath, "utf-8");
  const wxmlAST = wxmlParse(wxmlFileContent);
  const documentSymbols: DocumentSymbol[] = [];

  traverse(wxmlAST, {
    WXScript(node: any) {
      const { loc, startTag } = node;
      const { attributes } = startTag;
      let { name } = node;

      const moduleAttr = attributes.find(
        (attr: any) => attr.key === "module" && attr.value
      );

      if (moduleAttr) {
        name = `${name}[${moduleAttr.key}="${moduleAttr.value}"]`;
      }

      const range = new vscode.Range(
        new vscode.Position(loc.start.line - 1, loc.start.column - 1),
        new vscode.Position(loc.end.line - 1, loc.end.column - 1)
      );

      const selectionRange = new vscode.Range(
        new vscode.Position(
          startTag.loc.start.line - 1,
          startTag.loc.start.column - 1
        ),
        new vscode.Position(
          startTag.loc.end.line - 1,
          startTag.loc.end.column - 1
        )
      );

      const newDocumentSymbol = new vscode.DocumentSymbol(
        name,
        "",
        SymbolKind.Field,
        range,
        selectionRange
      );

      documentSymbols.push(newDocumentSymbol);
    },
    WXElement(node: any) {
      const { loc, startTag } = node;
      const { attributes } = startTag;
      let { name } = node;

      const idSelector = attributes.find(
        (attr: any) => attr.key === "id" && attr.value
      );

      const classSelector = attributes.find(
        (attr: any) => attr.key === "class" && attr.value
      );

      if (idSelector) {
        name = `${name}#${idSelector.value}`;
      }

      if (classSelector) {
        const { children } = classSelector;
        let classNameArr: string[] = [];

        if (children.length) {
          children.forEach((item: any) => {
            if (item.type === "WXText") {
              classNameArr.push(...item.value.trim().split(" "));
            }

            if (item.type === "WXAttributeInterpolation") {
              classNameArr.push(item.rawValue);
            }
          });
        } else {
          classNameArr = classSelector.value.trim().split(" ");
        }

        // 类名排序，以“{{”开头的放在后面
        classNameArr.sort(function (prev: string, next: string) {
          if (prev.startsWith("{{") && next.startsWith("{{")) {
            return 0;
          }

          if (!prev.startsWith("{{") && !next.startsWith("{{")) {
            return 0;
          }

          if (prev.startsWith("{{")) {
            return 1;
          }

          return -1;
        });

        const classNameStr = classNameArr.reduce(
          (prev: string, next: string) => {
            return `${prev}.${next}`;
          },
          ""
        );

        name = `${name}${classNameStr}`;
      }

      const range = new vscode.Range(
        new vscode.Position(loc.start.line - 1, loc.start.column - 1),
        new vscode.Position(loc.end.line - 1, loc.end.column - 1)
      );

      const selectionRange = new vscode.Range(
        new vscode.Position(
          startTag.loc.start.line - 1,
          startTag.loc.start.column - 1
        ),
        new vscode.Position(
          startTag.loc.end.line - 1,
          startTag.loc.end.column - 1
        )
      );

      const newDocumentSymbol = new vscode.DocumentSymbol(
        name,
        "",
        SymbolKind.Field,
        range,
        selectionRange
      );

      documentSymbols.push(newDocumentSymbol);
    },
    WXAttribute(node: any) {
      const { loc } = node;

      if (
        new RegExp(
          `^(bind|catch|mut-bind|capture-bind|capture-catch|capture-):?`
        ).test(node.key)
      ) {
        const name = `[${node.key}=${node.rawValue}]`;

        const range = new vscode.Range(
          new vscode.Position(loc.start.line - 1, loc.start.column - 1),
          new vscode.Position(loc.end.line - 1, loc.end.column - 1)
        );

        const selectionRange = range;

        const newDocumentSymbol = new vscode.DocumentSymbol(
          name,
          "",
          SymbolKind.Function,
          range,
          selectionRange
        );

        documentSymbols.push(newDocumentSymbol);
      }
    },
  });

  return documentSymbols;
}

export default function (context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ scheme: "file", pattern: "**/*.wxml" }],
      {
        provideDocumentSymbols,
      },
      {
        label: "wxml文档符号表",
      }
    )
  );
}
