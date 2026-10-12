import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const modules = {
  toolbar: [
    [{ header: [2, 3, 4, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link', 'blockquote'],
    ['clean'],
  ],
};

export default function QuillEditor({ value, onChange, placeholder }) {
  return <ReactQuill theme="snow" value={value} onChange={onChange} placeholder={placeholder} modules={modules} />;
}
