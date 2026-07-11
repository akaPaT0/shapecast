// Teach TypeScript about Google's <model-viewer> custom element
declare namespace JSX {
  interface IntrinsicElements {
    "model-viewer": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        "camera-controls"?: boolean | string;
        "auto-rotate"?: boolean | string;
        "shadow-intensity"?: string;
        exposure?: string;
        ar?: boolean | string;
        style?: React.CSSProperties;
      },
      HTMLElement
    >;
  }
}
