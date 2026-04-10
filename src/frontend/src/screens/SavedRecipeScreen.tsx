import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { ChatInput } from "@/components/chat-input";
import { useScenario } from "@/context/scenario-context";
import { useSessionOptional } from "@/context/session-context";

export function SavedRecipeScreen() {
  const navigate = useNavigate();
  const { scenario } = useScenario();
  const { name, nameCjk, deckText, cookingMethodPill, sourcePill, recipeText: RECIPE_TEXT } =
    scenario.savedRecipe;
  const session = useSessionOptional();
  const sendMessage = session?.sendMessage ?? (() => {});
  const navigateToScreen = session?.navigateToScreen;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(RECIPE_TEXT);
  const [savedText, setSavedText] = useState(RECIPE_TEXT);

  function handleEdit() {
    setIsEditing(true);
    setEditText(savedText);
  }

  function handleCancel() {
    setIsEditing(false);
    setEditText(savedText);
  }

  function handleSave() {
    setSavedText(editText);
    setIsEditing(false);
  }

  return (
    <div data-testid="screen-saved-recipe" className="min-h-screen bg-cream flex flex-col">
      {/* Nav bar */}
      <div data-testid="saved-recipe-nav" className="flex justify-between items-center px-[14px] pt-3 pb-1">
        <button type="button" aria-label="Go back" onClick={() => navigate(-1)}
          className="flex items-center justify-center min-w-[36px] min-h-[44px] text-ink-2 hover:text-ink transition-colors bg-transparent border-none cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <span className="text-[11px] font-semibold text-ink-2">SGA</span>
        <button type="button" onClick={isEditing ? handleSave : handleEdit}
          aria-label={isEditing ? "Save changes" : "Edit recipe"}
          className={`border-none rounded-full px-4 py-2 text-[11px] font-semibold cursor-pointer font-sans min-h-[34px] ${
            isEditing ? "bg-persimmon-soft text-persimmon" : "bg-cream-deep text-ink"
          }`}>
          {isEditing ? "Done" : "Edit"}
        </button>
      </div>

      {/* Recipe card */}
      <div className="mx-3.5 my-3.5 bg-paper rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-[20px] font-bold tracking-tight text-ink">
            {name}
          </h1>
          <p className="font-cjk text-[14px] font-medium text-ink-3 mt-1 tracking-[0.02em]">
            {nameCjk}
          </p>
          <p className="mt-[5px] text-[12px] text-ink-3">
            {deckText}
          </p>
        </div>

        {/* Pills */}
        <div className="flex flex-wrap gap-1.5 px-5 pb-3.5">
          <span className="bg-jade-soft text-jade px-3 py-[5px] rounded-full text-[10.5px] font-semibold">
            {cookingMethodPill}
          </span>
          <span className="bg-cream-deep text-ink-2 px-3 py-[5px] rounded-full text-[10.5px] font-semibold">
            {sourcePill}
          </span>
        </div>

        {/* View mode */}
        {!isEditing && (
          <pre className="font-mono text-[11.5px] leading-[1.7] text-ink-2 whitespace-pre bg-tofu px-5 py-4 border-t border-t-[0.5px] border-t-cream-deep overflow-x-auto border-b border-b-[0.5px] border-b-cream-deep">
            {savedText}
          </pre>
        )}

        {/* Edit mode */}
        {isEditing && (
          <>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full font-mono text-[11.5px] leading-[1.7] text-ink-2 bg-tofu border-none outline-none resize-none px-5 py-4 min-h-[180px] block"
            />
            <div className="flex gap-2 px-[18px] pt-2.5 pb-4">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 py-3 bg-cream-deep border-none rounded-md font-sans text-[13px] font-semibold text-ink cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-[1.5] py-3 bg-shoyu border-none rounded-md font-sans text-[13px] font-semibold text-cream cursor-pointer min-h-[44px]"
              >
                Save
              </button>
            </div>
          </>
        )}
      </div>

      {/* Chat input */}
      <ChatInput
        placeholder="Adjust this recipe for 8 people..."
        hint="Chat to modify this recipe"
        onSend={(text) => {
          navigateToScreen?.("saved_recipe");
          sendMessage(text);
        }}
      />

      {/* Footer */}
      <div className="text-center px-4 pt-3 pb-[22px] text-[10px] text-ink-3 font-medium mt-auto">
        Smart Grocery <span className="text-persimmon mx-[5px]">·</span> Vancouver
      </div>
    </div>
  );
}
