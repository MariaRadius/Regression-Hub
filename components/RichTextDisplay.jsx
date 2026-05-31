import parseHtml from 'html-react-parser';

/**
 * @see {@link __tests__/components/RichTextDisplay.test.jsx}
 */
export default function RichTextDisplay({ value, className, style }) {
  if (!value) return null;

  const isHtml = /<[a-z][\s\S]*>/i.test(value);

  if (isHtml) {
    return (
      <div className={`rte-display ${className || ''}`} style={style}>
        {parseHtml(value)}
      </div>
    );
  }

  const lines = value.split('\n');
  const numbered = /^\d+\.\s/;
  const bulleted = /^[-•*]\s/;

  const elements = [];
  let listType = null;
  let listItems = [];

  function flushList() {
    if (!listItems.length) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    elements.push(
      <Tag key={elements.length} style={{ margin: '2px 0', paddingLeft: 18 }}>
        {listItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </Tag>,
    );
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (numbered.test(trimmed)) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(trimmed.replace(/^\d+\.\s/, ''));
    } else if (bulleted.test(trimmed)) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(trimmed.replace(/^[-•*]\s/, ''));
    } else {
      flushList();
      elements.push(
        <p key={elements.length} style={{ margin: '1px 0' }}>
          {trimmed}
        </p>,
      );
    }
  }
  flushList();

  return (
    <div className={`rte-display ${className || ''}`} style={style}>
      {elements}
    </div>
  );
}
