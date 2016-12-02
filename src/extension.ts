import * as vscode from 'vscode';

import * as fs   from 'fs';
import * as path from 'path';
const _ = require('lodash');
const css = require('css');


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-css-peek" is now active!');

   let config = vscode.workspace.getConfiguration('css_peek');
   let active_languages       = (config.get('activeLanguages') as Array<string>);
   let search_file_extensions = (config.get('searchFileExtensions') as Array<string>);

   /*
   vscode.languages.getLanguages().then((languages: string[]) => {
      console.log("Known languages: " + languages);
   });
   */

   const peek_filter: vscode.DocumentFilter[] = active_languages.map((language) => {
      return {
         language: language,
         scheme: 'file'
      };
   });

   // Register the definition provider
   context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(peek_filter,
                     new PeekFileDefinitionProvider(search_file_extensions))
   );
}

// this method is called when your extension is deactivated
export function deactivate() {
}

/**
 * Function that walks a directory recursively and returns all files
 */
var walkSync = function(dir, filelist) {
  var fs = fs || require('fs'),
      files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
    if (fs.statSync(dir + file).isDirectory()) {
      filelist = walkSync(dir + file + '/', filelist);
    }
    else {
      filelist.push(file);
    }
  });
  return filelist;
};

/**
 * Provide the lookup so we can peek into the files.
 */
class PeekFileDefinitionProvider implements vscode.DefinitionProvider {
   protected fileSearchExtensions: string[] = [];

   constructor(fileSearchExtensions: string[] = []) {
      this.fileSearchExtensions = fileSearchExtensions;
   }

   async provideDefinition(document: vscode.TextDocument,
                     position: vscode.Position,
                     token: vscode.CancellationToken): Promise<vscode.Definition> {
      // todo: make this method operate async
      let working_dir = path.dirname(document.fileName);
      let word        = document.getText(document.getWordRangeAtPosition(position));
      let line        = document.lineAt(position);

      //console.log('====== peek-file definition lookup ===========');
      //console.log('word: ' + word);
      //console.log('line: ' + line.text);

      // We are looking for strings with filenames
      // - simple hack for now we look for the string with our current word in it on our line
      //   and where our cursor position is inside the string
      let re_str = `\"(.*?${word}.*?)\"|\'(.*?${word}.*?)\'`;
      let match = line.text.match(re_str);

      //console.log('re_str: ' + re_str);
      //console.log("   Match: ", match);

      if (null !== match)
      {
         let potential_fname = match[1] || match[2];
         let match_start = match.index;
         let match_end   = match.index + potential_fname.length;

         // Verify the match string is at same location as cursor
         if((position.character >= match_start) &&
            (position.character <= match_end))
         {
            let full_path   = path.resolve(working_dir, potential_fname);
            //console.log(" Match: ", match);
            //console.log(" Fname: " + potential_fname);
            //console.log("  Full: " + full_path);

            // Find all potential paths to check and return the first one found
            // let potential_fnames = this.getPotentialPaths(full_path);
            // let potential_fnames = this.getPotentialPaths(working_dir);
            let potential_fnames: any = _(await vscode.workspace.findFiles("**/*.css", "")).map(f => f.fsPath)
            // let potential_fnames: any = _(await vscode.workspace.findFiles("**/*.css", "")).map(f => f.fsPath).reject(f => /node_modules/ig.test(f) || /bower_components/ig.test(f)).value();

            //console.log(" potential fnames: ", potential_fnames);
            let found_fname = potential_fnames.find(file => {
              const file_text = fs.readFileSync(file, "utf8");
              let parsed_css = null;
              try {
                parsed_css = css.parse(file_text)
                if(!parsed_css) throw new Error("No CSS ?")
                if(parsed_css.type !== "stylesheet") throw new Error("CSS isn't a stylesheet")
                if(!parsed_css.stylesheet.rules) throw new Error("no CSS rules")

                let rule = parsed_css.stylesheet.rules.find(rule => {
                  return rule.type == "rule" &&  ( _.includes(rule.selectors, "." + word, 0) || _.includes(rule.selectors, "#" + word, 0) ) // TODO: don't generalize class and ID selector
                })

                if(!rule) throw new Error("CSS rule not found")

                return true;

              } catch (error) {
                //Error in parsing CSS
                // position = new vscode.Position(0, 1);
                // console.log(parsed_css);
                // console.error(error);
              }
              return false;
            });

            found_fname = found_fname || potential_fnames[0];

            if (found_fname) {
               console.log('found: ' + found_fname);
               const file_text = fs.readFileSync(found_fname, "utf8");
              //  console.log(css.parse("h1{\"color\":\"#000\"}"));
              let position = null;
              let parsed_css = null;
              try {
                parsed_css = css.parse(file_text)
                if(!parsed_css) throw new Error("No CSS ?")
                if(parsed_css.type !== "stylesheet") throw new Error("CSS isn't a stylesheet")
                if(!parsed_css.stylesheet.rules) throw new Error("no CSS rules")

                let rule = parsed_css.stylesheet.rules.find(rule => {
                  return rule.type == "rule" &&  ( _.includes(rule.selectors, "." + word, 0) || _.includes(rule.selectors, "#" + word, 0) ) // TODO: don't generalize class and ID selector
                })

                if(!rule) throw new Error("CSS rule not found")

                position = new vscode.Position(rule.position.start.line, rule.position.start.column);

              } catch (error) {
                //Error in parsing CSS
                position = new vscode.Position(0, 1);
                console.log(parsed_css);
                // console.error(error);
              }
              // console.log(parsed_css);
               return new vscode.Location(vscode.Uri.file(found_fname), position);
            }
         }
      }

      return null;
   }
}
