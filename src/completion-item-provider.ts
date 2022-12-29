import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";
import * as wxmlParser from "@wxml/parser";
import * as wxmlGenerator from "@wxml/generator";
import { CompletionItem, CancellationToken } from "vscode";
import { parse as cssParse, walk as cssWalk } from "css-tree";

const { parse: wxmlParse } = wxmlParser;
const { traverse } = wxmlGenerator;

const DOT_CHARACTER = "."; // .字符
const SPACE_CHARACTER = " "; // 空格
const SINGLE_QUOTATION_CHARACTER = "'"; // 单引号
const DOUBLE_QUOTATION_CHARACTER = '"'; // 双引号
const TWO_SINGLE_QUOTATION_CHARACTER = "''"; // 成对单引号
const TWO_DOUBLE_QUOTATION_CHARACTER = '""'; // 成对双引号
const DOUBLE_DASH = "--"; // --字符
const CSS_VAR = "var(--"; // --字符
const WXML_FILE = ".wxml"; // wxml类型文件
const WXSS_FILE = ".wxss"; // wxss类型文件

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
  return getExtname(filePath) === WXML_FILE;
}

/**
 * 是否为wxss文件
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function isWxss(filePath: string): boolean {
  return getExtname(filePath) === WXSS_FILE;
}

/**
 * 获取工作区路径
 *
 * @param {string} filePath
 * @returns {string}
 */
function getWorkSpacePath(filePath: string): string {
  const workSpaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(filePath)
  );

  if (workSpaceFolder) {
    return workSpaceFolder.uri.fsPath;
  }

  return "";
}

/**
 * 获取指定wxss文件中的类名
 *
 * @param {string} filePath
 * @returns {string[]}
 */
function getWxssClassName(filePath: string): string[] {
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
        const importPath = node.prelude.children.head.data.value;
        let subFilePath = "";

        if (importPath.startsWith("/")) {
          const workSpacePath = getWorkSpacePath(filePath);
          subFilePath = path.join(workSpacePath, importPath);
        } else {
          const dir = path.dirname(filePath);
          subFilePath = path.resolve(dir, importPath);
        }

        classNames = classNames.concat(getWxssClassName(subFilePath));
      }
    },
  });

  return [...new Set(classNames)];
}

/**
 * 获取app.wxss文件路径
 *
 * @param {string} workSpacePath
 * @returns {string}
 */
function getAppWxssFilePath(workSpacePath: string): string {
  const projectJson = path.join(workSpacePath, "project.config.json");

  if (!fs.existsSync(projectJson)) {
    return "";
  }

  let projectObj = null;

  try {
    projectObj = JSON.parse(fs.readFileSync(projectJson, "utf-8"));
  } catch (error) {}

  if (!projectObj) {
    return "";
  }

  const { miniprogramRoot } = projectObj;
  const appWxssFileName = `app${WXSS_FILE}`;
  let appWxssPath = path.join(workSpacePath + appWxssFileName);

  if (miniprogramRoot) {
    appWxssPath = path.join(workSpacePath, miniprogramRoot, appWxssFileName);
  }

  return appWxssPath;
}

/**
 * 获取app.wxss文件中的类名
 *
 * @returns {string[]}
 */
function getAppWxssClassNames(workSpacePath: string): string[] {
  const appWxssPath = getAppWxssFilePath(workSpacePath);

  if (!appWxssPath) {
    return [];
  }

  return getWxssClassName(appWxssPath);
}

/**
 * 获取光标前面指定数量的字符
 *
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @param {number} num
 * @returns {string}
 */
function getCursorCharacter(
  document: vscode.TextDocument,
  position: vscode.Position,
  num: number
): string {
  const lineText = document.lineAt(position).text;
  const typeText = lineText.substring(
    position.character - num,
    position.character
  );

  return typeText;
}

/**
 * 获取指定wxss文件中page标签里面定义的css变量
 *
 * @param {string} filePath
 * @returns {string[]}
 */
function getWxssVariables(filePath: string): string[] {
  const cssContent = fs.readFileSync(filePath, "utf8");
  const cssAst = cssParse(cssContent, {
    atrule: "@import",
  });

  let cssVariable: string[] = [];

  cssWalk(cssAst, {
    visit: "Rule",
    enter(node: any) {
      let hasPage = false;

      cssWalk(node.prelude, {
        visit: "TypeSelector",
        enter(node: any) {
          if (node.name === "page") {
            hasPage = true;
          }
        },
      });

      if (hasPage) {
        cssWalk(node.block, {
          visit: "Declaration",
          enter(node: any) {
            if (node.property.startsWith("--")) {
              cssVariable.push(node.property);
            }
          },
        });
      }
    },
  });

  // 遍历@import，获取被import文件里面的样式变量
  cssWalk(cssAst, {
    visit: "Atrule",
    enter(node: any) {
      if (node.name === "import") {
        const importPath = node.prelude.children.head.data.value;
        let subFilePath = "";

        if (importPath.startsWith("/")) {
          const workSpacePath = getWorkSpacePath(filePath);
          subFilePath = path.join(workSpacePath, importPath);
        } else {
          const dir = path.dirname(filePath);
          subFilePath = path.resolve(dir, importPath);
        }

        cssVariable = cssVariable.concat(getWxssVariables(subFilePath));
      }
    },
  });

  return [...new Set(cssVariable)];
}
/**
 * 获取全局css变量
 *
 * @param {*} workSpacePath
 * @returns {string[]}
 */
function getGlobalCssVariable(workSpacePath: string): string[] {
  const appWxssPath = getAppWxssFilePath(workSpacePath);

  if (!appWxssPath) {
    return [];
  }

  return getWxssVariables(appWxssPath);
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
    basename.substring(0, basename.lastIndexOf(extname)) + WXSS_FILE
  );

  if (!fs.existsSync(wxssFilePath)) {
    return [];
  }

  const workSpacePath = getWorkSpacePath(filePath);
  const appWxssClassNames = getAppWxssClassNames(workSpacePath);
  let classNames = getWxssClassName(wxssFilePath);

  classNames = classNames.concat(appWxssClassNames);
  classNames = [...new Set(classNames)];

  return classNames.map((item: string) => {
    let newItem = item;

    if (
      text.match(new RegExp(`class=${SINGLE_QUOTATION_CHARACTER}$`)) &&
      nextCharacter !== SINGLE_QUOTATION_CHARACTER
    ) {
      newItem = `${newItem}${SINGLE_QUOTATION_CHARACTER}`;
    } else if (
      text.match(new RegExp(`class=${DOUBLE_QUOTATION_CHARACTER}$`)) &&
      nextCharacter !== DOUBLE_QUOTATION_CHARACTER
    ) {
      newItem = `${newItem}${DOUBLE_QUOTATION_CHARACTER}`;
    }

    return new vscode.CompletionItem(newItem, vscode.CompletionItemKind.Text);
  });
}

/**
 * 从wxml文件中提取用于自动完成的类名
 *
 * @param {string} filePath
 * @returns {CompletionItem[]}
 */
function getVscodeCompletionItemFromWxml(
  filePath: string,
  typeText: string
): CompletionItem[] {
  // 如果是.字符，则从wxml文件中获取类名
  if (typeText === DOT_CHARACTER) {
    const dirname = path.dirname(filePath);
    const extname = path.extname(filePath);
    const basename = path.basename(filePath);
    const wxmlFilePath = path.join(
      dirname,
      basename.substring(0, basename.lastIndexOf(extname)) + WXML_FILE
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

  // 如果是var字符，则从全局样式中获取全局样式变量
  if (typeText === CSS_VAR) {
    const workSpacePath = getWorkSpacePath(filePath);
    const cssVariable = getGlobalCssVariable(workSpacePath);

    return cssVariable.map((item: string) => {
      return new vscode.CompletionItem(
        `${item}`,
        vscode.CompletionItemKind.Text
      );
    });
  }

  return [];
}

/**
 * @param {*} document
 * @param {*} position
 */
function provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  const filePath = document.fileName;
  let typeText = getCursorCharacter(document, position, 1);

  // 在wxss文件中输入.时，提示wxml中定义的类名
  if (isWxss(filePath)) {
    if (typeText === DOT_CHARACTER) {
      return getVscodeCompletionItemFromWxml(filePath, typeText);
    }

    typeText = getCursorCharacter(document, position, 6);

    if (typeText === CSS_VAR) {
      return getVscodeCompletionItemFromWxml(filePath, typeText);
    }

    return;
  }

  // 在wxml文件中输入类名时，提示wxss中的类名
  if (isWxml(filePath)) {
    if (
      ![
        SPACE_CHARACTER,
        SINGLE_QUOTATION_CHARACTER,
        DOUBLE_QUOTATION_CHARACTER,
      ].includes(typeText)
    ) {
      return;
    }

    const start: vscode.Position = new vscode.Position(position.line, 0);
    const range: vscode.Range = new vscode.Range(start, position);
    const text: string = document.getText(range);

    if (
      !text.match(
        new RegExp(
          `class=[${SINGLE_QUOTATION_CHARACTER}${DOUBLE_QUOTATION_CHARACTER}]`
        )
      )
    ) {
      return;
    }

    // 光标所在行内容
    const lineText = document.lineAt(position).text;
    // 光标处下一个字符
    const nextCharacter = lineText.substring(
      position.character,
      position.character + 1
    );

    return getVscodeCompletionItemFromWxss(filePath, text, nextCharacter);
  }
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
        { scheme: "file", pattern: "**/*.wxss" },
        { scheme: "file", pattern: "**/*.wxml" },
      ],
      {
        provideCompletionItems,
        resolveCompletionItem,
      },
      ...[
        DOT_CHARACTER,
        SPACE_CHARACTER,
        SINGLE_QUOTATION_CHARACTER,
        DOUBLE_QUOTATION_CHARACTER,
        TWO_SINGLE_QUOTATION_CHARACTER,
        TWO_DOUBLE_QUOTATION_CHARACTER,
        DOUBLE_DASH,
      ]
    )
  );
}
