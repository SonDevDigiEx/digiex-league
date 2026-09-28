import { Component, type ReactNode } from 'react';

/** Last-resort guard so a rendering bug shows a reload prompt instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error(err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot">
        <div>Đã có lỗi hiển thị.<br /><a onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>Tải lại trang</a></div>
      </div>
    );
  }
}
