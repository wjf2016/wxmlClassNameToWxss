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

      const eventBindingArr = attributes.filter(
        (attr: any) => attr.key.match("^bind:?") && attr.value
      );

      if (idSelector) {
        name = `${name}#${idSelector.value}`;
      }

      if (classSelector) {
        const classNameArr = classSelector.value.split(" ");
        const classNameStr = classNameArr.reduce(
          (prev: string, next: string) => {
            return `${prev}.${next}`;
          },
          ""
        );

        name = `${name}${classNameStr}`;
      }

      if (eventBindingArr.length) {
        const eventBindingStr = eventBindingArr.reduce(
          (prev: any, next: any) => {
            return `${prev}[${next.key}="${next.value}"]`;
          },
          ""
        );

        name = `${name}${eventBindingStr}`;
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
