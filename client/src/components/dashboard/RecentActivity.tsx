import { Link } from "wouter";

interface Activity {
  id: number;
  type: "repost" | "impression" | "influencer" | "comment";
  title: string;
  description: string;
  time: string;
}

interface RecentActivityProps {
  activities: Activity[];
}

export function RecentActivity({ activities }: RecentActivityProps) {
  // Icon mapping for activity types
  const getIcon = (type: Activity['type']) => {
    switch (type) {
      case "repost":
        return "fas fa-share-nodes";
      case "impression":
        return "fas fa-thumbs-up";
      case "influencer":
        return "fas fa-user-plus";
      case "comment":
        return "fas fa-comment";
      default:
        return "fas fa-bell";
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-neutral-900">Recent Activity</h3>
        <Link href="/activities" className="text-sm text-primary hover:underline">
          View all
        </Link>
      </div>
      
      <div className="space-y-4">
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start">
            <div className="h-8 w-8 rounded-full bg-neutral-100 flex items-center justify-center mr-3 mt-1">
              <i className={`${getIcon(activity.type)} text-neutral-600 text-sm`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900" dangerouslySetInnerHTML={{ __html: activity.description }} />
              <p className="text-xs text-neutral-500 mt-1">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
