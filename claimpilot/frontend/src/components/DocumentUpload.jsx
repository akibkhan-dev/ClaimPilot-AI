// Document upload component — provides a UI for uploading insurance documents to Module B

import { useState, useRef } from "react";
import { verifyDocument } from "../api/client";
import ResultCard from "./ResultCard";

export default function DocumentUpload() {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const fileRef = useRef();

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f));
    setResult(null); setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) { setError("Please select a document image."); return; }
    setLoading(true); setError(null);
    try {
      const data = await verifyDocument(file);
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          onClick={() => fileRef.current.click()}
          className="border-2 border-dashed border-teal-300 rounded-xl p-6 text-center cursor-pointer hover:border-teal-500 transition-colors"
        >
          {preview ? (
            <img src={preview} alt="preview" className="mx-auto max-h-48 rounded-lg object-contain" />
          ) : (
            <div className="text-gray-400">
              <p className="text-3xl mb-2">📄</p>
              <p className="text-sm">Upload RC book, Driving Licence, or Claim Form</p>
              <p className="text-xs mt-1">JPG, PNG, PDF screenshots</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm">
          {loading ? "Verifying document..." : "Verify Document"}
        </button>
      </form>

      {result && (
        <ResultCard title="Document Verification">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${result.is_complete ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {result.is_complete ? "Complete" : "Incomplete"}
              </span>
              <span className="text-sm text-gray-500">{result.document_type_guess}</span>
              <span className="text-xs text-gray-400 italic">[{result.source}]</span>
            </div>

            {result.fields_found && (
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(result.fields_found).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400 capitalize">{k.replace(/_/g, " ")}</p>
                    <p className="text-sm font-medium text-gray-800 truncate">{v || "—"}</p>
                  </div>
                ))}
              </div>
            )}

            {result.missing_fields?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">Missing / unreadable fields:</p>
                <p className="text-xs text-amber-600">{result.missing_fields.join(", ")}</p>
              </div>
            )}
          </div>
        </ResultCard>
      )}
    </div>
  );
}
