'use client';

import { type Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const markdownComponents: Components = {
  code({ className: codeClassName, children, ...props }) {
    const match = /language-(\w+)/.exec(codeClassName ?? '');
    const code = (typeof children === 'string' ? children : '').replace(/\n$/, '');

    if (match) {
      return (
        <SyntaxHighlighter language={match[1]} style={oneDark} PreTag="div">
          {code}
        </SyntaxHighlighter>
      );
    }

    return (
      <code className={codeClassName} {...props}>
        {children}
      </code>
    );
  },
};
