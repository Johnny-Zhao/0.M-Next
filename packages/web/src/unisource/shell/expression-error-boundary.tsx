import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

interface ExpressionErrorBoundaryProps {
  readonly children: ReactNode;
  readonly resetKey: string;
}

interface ExpressionErrorBoundaryState {
  readonly failed: boolean;
  readonly retryKey: number;
}

/** Keeps an individual expression failure from unmounting the workspace shell. */
export class ExpressionErrorBoundary extends Component<
  ExpressionErrorBoundaryProps,
  ExpressionErrorBoundaryState
> {
  state: ExpressionErrorBoundaryState = { failed: false, retryKey: 0 };

  static getDerivedStateFromError(
    _error: Error,
  ): Pick<ExpressionErrorBoundaryState, "failed"> {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    console.error("Expression view render failed", error);
  }

  componentDidUpdate(previous: ExpressionErrorBoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  private retry = (): void => {
    this.setState((current) => ({
      failed: false,
      retryKey: current.retryKey + 1,
    }));
  };

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <section className="us-canvas-empty" role="alert">
          <h2>视图渲染失败</h2>
          <p>当前视图未能完成渲染，请重试或重新打开表达。</p>
          <button onClick={this.retry} type="button">
            重试
          </button>
        </section>
      );
    }
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}
