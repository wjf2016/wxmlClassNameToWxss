import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";
import * as wxmlParser from "@wxml/parser";
import * as wxmlGenerator from "@wxml/generator";
import { CompletionItem, CancellationToken } from "vscode";
import { parse as cssParse, walk as cssWalk } from "css-tree";

const { parse: wxmlParse } = wxmlParser;
const { traverse } = wxmlGenerator;

/**
 * 获取文件扩展名
 *
 * @param {string} filePath
 * @returns {string}
 */
function getExtname(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

/**
 * 是否为wxml文件
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function isWxml(filePath: string): boolean {
  return getExtname(filePath) === ".wxml";
}

/**
 * 是否为wxss文件
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function isWxss(filePath: string): boolean {
  return getExtname(filePath) === ".wxss";
}

/**
 * @param {*} document
 * @param {*} position
 */
function provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  // 光标所在行内容
  const lineText = document.lineAt(position).text;
  // 键入的字符
  const typeText = lineText.substring(
    position.character - 1,
    position.character
  );
  // 光标处下一个字符
  const nextCharacter = lineText.substring(
    position.character,
    position.character + 1
  );

  const filePath = document.fileName;

  // 在wxss文件中输入.时，提示wxml中定义的类名
  if (isWxss(filePath)) {
    if (typeText !== ".") {
      return;
    }

    return getVscodeCompletionItemFromWxml(filePath);
  }

  // 在wxml文件中输入类名时，提示wxss中的类名
  if (isWxml(filePath)) {
    if (![" ", "'", '"'].includes(typeText)) {
      return;
    }

    const start: vscode.Position = new vscode.Position(position.line, 0);
    const range: vscode.Range = new vscode.Range(start, position);
    const text: string = document.getText(range);

    if (!text.match(/class=(["']$|["'].*["']$)/)) {
      return;
    }

    return getVscodeCompletionItemFromWxss(filePath, text, nextCharacter);
  }
}

/**
 * 从wxml文件中提取用于自动完成的类名
 *
 * @param {string} filePath
 * @returns {CompletionItem[]}
 */
function getVscodeCompletionItemFromWxml(filePath: string): CompletionItem[] {
  const dirname = path.dirname(filePath);
  const extname = path.extname(filePath);
  const basename = path.basename(filePath);
  const wxmlFilePath = path.join(
    dirname,
    basename.substring(0, basename.lastIndexOf(extname)) + ".wxml"
  );

  if (!fs.existsSync(wxmlFilePath)) {
    return [];
  }

  const wxmlFileContent = fs.readFileSync(wxmlFilePath, "utf-8");
  const wxmlAST = wxmlParse(wxmlFileContent);
  let classNames: string[] = [];

  traverse(wxmlAST, {
    WXAttribute(node: any) {
      if (node.key === "class") {
        const { value, children } = node;

        if (!children.length) {
          classNames.push(...value.split(" "));
        }

        children.forEach((child: any) => {
          const { type, value } = child;

          if (type === "WXText") {
            classNames.push(...value.split(" "));
          }
        });
      }
    },
  });

  classNames = [...new Set(classNames.filter((item) => item))];

  return classNames.map((item: string) => {
    return new vscode.CompletionItem(
      `.${item}`,
      vscode.CompletionItemKind.Text
    );
  });
}

/**
 * 从wxss文件中提取用于自动完成的类名
 *
 * @param {string} filePath
 * @returns {CompletionItem[]}
 */
function getVscodeCompletionItemFromWxss(
  filePath: string,
  text: string,
  nextCharacter: string
): CompletionItem[] {
  const dirname = path.dirname(filePath);
  const extname = path.extname(filePath);
  const basename = path.basename(filePath);
  const wxssFilePath = path.join(
    dirname,
    basename.substring(0, basename.lastIndexOf(extname)) + ".wxss"
  );

  if (!fs.existsSync(wxssFilePath)) {
    return [];
  }

  function getClassName(filePath: string): string[] {
    const cssContent = fs.readFileSync(filePath, "utf8");
    const cssAst = cssParse(cssContent, { atrule: "@import" });
    let classNames: string[] = [];

    // 遍历类名选择器，获取类名
    cssWalk(cssAst, {
      visit: "ClassSelector",
      enter(node: any) {
        classNames.push(node.name);
      },
    });

    // 遍历@import，获取被import文件里面的类名
    cssWalk(cssAst, {
      visit: "Atrule",
      enter(node: any) {
        if (node.name === "import") {
          const importPath = node.prelude.head.data.value;
          let subFilePath = "";

          if (importPath.startsWith("/")) {
            subFilePath = path.join(__dirname, importPath);
          } else {
            const dir = path.dirname(filePath);
            subFilePath = path.resolve(dir, importPath);
          }

          classNames = classNames.concat(getClassName(subFilePath));
        }
      },
    });

    return classNames;
  }

  let classNames = getClassName(wxssFilePath);
  classNames = [...new Set(classNames)];

  return classNames.map((item: string) => {
    let newItem = item;

    if (text.match(/class='$/) && nextCharacter !== "'") {
      newItem = `${newItem}'`;
    } else if (text.match(/class="$/) && nextCharacter !== '"') {
      newItem = `${newItem}"`;
    }

    return new vscode.CompletionItem(newItem, vscode.CompletionItemKind.Text);
  });
}

/**
 * 光标选中当前自动补全item时触发动作，一般情况下无需处理
 * @param {*} item
 * @param {*} token
 */
function resolveCompletionItem(item: CompletionItem, token: CancellationToken) {
  console.log(item, token);
  return null;
}

export default function (context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { scheme: "file", language: "css" },
        { scheme: "file", language: "wxss" },
        { scheme: "file", language: "html" },
        { scheme: "file", language: "wxml" },
      ],
      {
        provideCompletionItems,
        resolveCompletionItem,
      },
      ...[".", " ", '"', "'", "''", '""']
    )
  );
}
