import { Button } from "@/components/ui/button";

interface CommentSuggestion {
  id: number;
  title: string;
  comment: string;
}

interface AICommentSuggestionsProps {
  suggestions: CommentSuggestion[];
  onRegenerate: (id: number) => void;
  onUse: (id: number) => void;
}

export function AICommentSuggestions({ suggestions, onRegenerate, onUse }: AICommentSuggestionsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
      <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200">
        <h3 className="font-semibold text-neutral-900">AI-Generated Comment Suggestions</h3>
        <p className="text-neutral-600 text-sm">Personalized comments for your next repost</p>
      </div>
      
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {suggestions.map(suggestion => (
            <div key={suggestion.id} className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
              <div className="flex items-center mb-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center mr-3">
                  <i className="fas fa-lightbulb text-primary"></i>
                </div>
                <h4 className="font-medium text-neutral-900">{suggestion.title}</h4>
              </div>
              <p className="text-neutral-700 text-sm mb-3">
                "{suggestion.comment}"
              </p>
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-neutral-500 hover:text-neutral-700"
                  onClick={() => onRegenerate(suggestion.id)}
                >
                  <i className="fas fa-refresh mr-1"></i> Regenerate
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-primary hover:text-primary-dark font-medium"
                  onClick={() => onUse(suggestion.id)}
                >
                  <i className="fas fa-check mr-1"></i> Use
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
