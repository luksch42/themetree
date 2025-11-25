import * as vscode from 'vscode';
import { BranchWatcher } from './git/branchWatcher';
import { ThemeApplier } from './theme/themeApplier';

let branchWatcher: BranchWatcher | undefined;
let themeApplier: ThemeApplier | undefined;

/**
 * Extension activation.
 * Called when the extension is activated (on startup).
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Themetree: Activating...');

  themeApplier = new ThemeApplier();
  
  // Initialize branch watcher with callback to apply theme
  branchWatcher = new BranchWatcher(async (branchName) => {
    console.log(`Themetree: Branch changed to "${branchName}"`);
    await themeApplier?.applyTheme(branchName);
  });

  // Register commands
  const refreshCommand = vscode.commands.registerCommand('themetree.refresh', async () => {
    branchWatcher?.refresh();
  });

  const clearCommand = vscode.commands.registerCommand('themetree.clear', async () => {
    await themeApplier?.clearColors();
  });

  context.subscriptions.push(refreshCommand, clearCommand);

  // Listen for workspace folder changes (when user opens a folder)
  const workspaceFoldersChanged = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
    console.log('Themetree: Workspace folders changed, reinitializing...');
    await branchWatcher?.initialize();
    const currentBranch = branchWatcher?.getCurrentBranch();
    await themeApplier?.applyTheme(currentBranch);
  });

  context.subscriptions.push(workspaceFoldersChanged);

  // Start watching for branch changes
  await branchWatcher.initialize();

  // Apply theme for current branch immediately (if workspace is open)
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const currentBranch = branchWatcher.getCurrentBranch();
    await themeApplier.applyTheme(currentBranch);
  }

  console.log('Themetree: Activated successfully');
}

/**
 * Extension deactivation.
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  console.log('Themetree: Deactivating...');
  branchWatcher?.dispose();
}

