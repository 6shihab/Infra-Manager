import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }

    handleReload = (): void => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                    <div className="text-red-400 text-6xl">!</div>
                    <h2 className="text-xl font-bold text-white">Something went wrong</h2>
                    <p className="text-gray-400 text-sm max-w-md text-center">
                        An unexpected error occurred while rendering this page.
                    </p>
                    {this.state.error && (
                        <pre className="text-xs text-gray-500 bg-black/30 rounded px-4 py-2 max-w-lg overflow-auto">
                            {this.state.error.message}
                        </pre>
                    )}
                    <button
                        onClick={this.handleReload}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors"
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
