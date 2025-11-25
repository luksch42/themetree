import * as vscode from 'vscode';

/**
 * Git extension API types
 * Based on vscode.git extension's actual API
 */
interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: Repository[];
  onDidOpenRepository: vscode.Event<Repository>;
  onDidCloseRepository: vscode.Event<Repository>;
}

interface Repository {
  state: RepositoryState;
  rootUri: vscode.Uri;
}

interface RepositoryState {
  HEAD?: {
    name?: string;
    commit?: string;
    type?: number;
  };
  onDidChange: vscode.Event<void>;
}

export type BranchChangeHandler = (branchName: string | undefined) => void;

/**
 * Watches for git branch changes in the current workspace.
 */
export class BranchWatcher {
  private gitAPI: GitAPI | undefined;
  private disposables: vscode.Disposable[] = [];
  private onBranchChange: BranchChangeHandler;
  private currentBranch: string | undefined;
  private pollInterval: NodeJS.Timeout | undefined;

  constructor(onBranchChange: BranchChangeHandler) {
    this.onBranchChange = onBranchChange;
  }

  /**
   * Initialize the watcher by connecting to VSCode's git extension.
   */
  async initialize(): Promise<void> {
    try {
      const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      
      if (!gitExtension) {
        console.log('Themetree: Git extension not found, using polling fallback');
        this.startPolling();
        return;
      }

      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      this.gitAPI = gitExtension.exports.getAPI(1);
      
      // Watch existing repositories
      for (const repo of this.gitAPI.repositories) {
        this.watchRepository(repo);
      }

      // Watch for new repositories being opened
      this.disposables.push(
        this.gitAPI.onDidOpenRepository((repo) => {
          console.log('Themetree: New repository opened');
          this.watchRepository(repo);
          this.checkCurrentBranch();
        })
      );

      // Get initial branch
      this.checkCurrentBranch();
      
      console.log('Themetree: Git watcher initialized');
    } catch (error) {
      console.error('Themetree: Error initializing git watcher, using polling fallback', error);
      this.startPolling();
    }
  }

  /**
   * Watch a repository for state changes.
   */
  private watchRepository(repo: Repository): void {
    try {
      // The event is on repo.state.onDidChange, not repo.onDidChangeState
      if (repo.state && typeof repo.state.onDidChange === 'function') {
        this.disposables.push(
          repo.state.onDidChange(() => {
            this.checkCurrentBranch();
          })
        );
        console.log('Themetree: Watching repository:', repo.rootUri?.fsPath);
      } else {
        console.log('Themetree: Repository state.onDidChange not available, using polling');
        this.startPolling();
      }
    } catch (error) {
      console.error('Themetree: Error watching repository', error);
      this.startPolling();
    }
  }

  /**
   * Fallback polling mechanism if git events don't work.
   */
  private startPolling(): void {
    if (this.pollInterval) {
      return; // Already polling
    }
    
    console.log('Themetree: Starting polling fallback (every 2 seconds)');
    this.pollInterval = setInterval(() => {
      this.checkCurrentBranch();
    }, 2000);
  }

  /**
   * Check the current branch and notify if changed.
   */
  private checkCurrentBranch(): void {
    const branchName = this.getCurrentBranch();
    
    if (branchName !== this.currentBranch) {
      console.log(`Themetree: Branch changed from "${this.currentBranch}" to "${branchName}"`);
      this.currentBranch = branchName;
      this.onBranchChange(branchName);
    }
  }

  /**
   * Get the current branch name.
   */
  getCurrentBranch(): string | undefined {
    if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
      return undefined;
    }

    // Use the first repository (primary workspace)
    const repo = this.gitAPI.repositories[0];
    return repo.state?.HEAD?.name;
  }

  /**
   * Force a refresh of the current branch.
   */
  refresh(): void {
    this.currentBranch = undefined; // Reset to force notification
    this.checkCurrentBranch();
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
