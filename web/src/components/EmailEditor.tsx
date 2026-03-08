import { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import ImageResize from 'tiptap-extension-resize-image';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import EditorToolbar from './EditorToolbar';

interface EmailEditorProps {
  content: string;
  onContentChange: (html: string) => void;
}

export default function EmailEditor({ content, onContentChange }: EmailEditorProps) {
  const [sourceView, setSourceView] = useState(false);
  const [rawHtml, setRawHtml] = useState('');
  const isInternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      ImageResize.configure({
        inline: false,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color.configure({
        types: ['textStyle'],
      }),
      Table.configure({
        resizable: false,
        HTMLAttributes: { style: 'border-collapse: collapse; width: 100%;' },
      }),
      TableRow,
      TableCell.configure({
        HTMLAttributes: { style: 'border: 1px solid #d1d5db; padding: 8px;' },
      }),
      TableHeader.configure({
        HTMLAttributes: { style: 'border: 1px solid #d1d5db; padding: 8px; background-color: #f1f5f9; font-weight: bold;' },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onContentChange(editor.getHTML());
    },
    editorProps: {
      handleDrop: (_view, event) => {
        // Block image file drops (would produce base64)
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('image/')) {
              event.preventDefault();
              alert('Image file drops are not supported. Please use an image URL instead.');
              return true;
            }
          }
        }
        return false;
      },
      handlePaste: (_view, event) => {
        // Block pasted image files (would produce base64)
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('image/')) {
              event.preventDefault();
              alert('Image paste is not supported. Please use an image URL instead.');
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  // Sync external content changes (e.g., campaign load) into editor
  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const handleToggleSource = (toSource: boolean) => {
    if (toSource && editor) {
      setRawHtml(editor.getHTML());
    } else if (!toSource && editor) {
      editor.commands.setContent(rawHtml);
      onContentChange(rawHtml);
    }
    setSourceView(toSource);
  };

  const handleRawHtmlChange = (value: string) => {
    setRawHtml(value);
    onContentChange(value);
  };

  if (!editor) return null;

  return (
    <div>
      {/* Visual / Source toggle */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-3 w-fit">
        <button
          type="button"
          onClick={() => handleToggleSource(false)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            !sourceView
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Visual
        </button>
        <button
          type="button"
          onClick={() => handleToggleSource(true)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            sourceView
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Source
        </button>
      </div>

      {sourceView ? (
        <textarea
          value={rawHtml}
          onChange={(e) => handleRawHtmlChange(e.target.value)}
          placeholder="Enter your HTML email content..."
          className="w-full h-96 px-4 py-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
        />
      ) : (
        <div className="border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent overflow-hidden">
          <EditorToolbar editor={editor} />
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
}
