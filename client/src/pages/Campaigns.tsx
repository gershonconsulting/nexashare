import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Pencil, 
  Trash, 
  Loader2, 
  Plus, 
  Check, 
  X,
  AlertCircle,
  Globe,
  RefreshCw
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

// Form schema for creating/editing a company page (campaign)
const formSchema = z.object({
  pageName: z.string().min(2, {
    message: "Company name must be at least 2 characters.",
  }),
  linkedinPageUrl: z.string().url({
    message: "Please enter a valid LinkedIn URL.",
  }),
  repostFrequency: z.enum(["daily", "weekly", "monthly", "random"]),
  active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

// Component for company page card
function CompanyPageCard({ 
  companyPage, 
  onEdit, 
  onDelete,
  hasReposts,
  onToggleAutoRepost
}: { 
  companyPage: any, 
  onEdit: (page: any) => void, 
  onDelete: (id: number) => void,
  hasReposts?: boolean,
  onToggleAutoRepost: (id: number, enabled: boolean) => void
}) {
  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      case 'random': return 'Random';
      default: return frequency;
    }
  };

  const getCompanySlug = (url: string) => {
    try {
      const match = url.match(/linkedin\.com\/(?:company|showcase)\/([^\/\?]+)/);
      return match ? match[1] : url;
    } catch {
      return url;
    }
  };

  const getPostsFeedUrl = (url: string) => {
    const slug = getCompanySlug(url);
    const isShowcase = url.includes('/showcase/');
    const type = isShowcase ? 'showcase' : 'company';
    return `https://www.linkedin.com/${type}/${slug}/posts/?feedView=all`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{companyPage.pageName}</CardTitle>
            <CardDescription className="mt-1">
              <a 
                href={companyPage.linkedinPageUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center text-muted-foreground hover:text-primary"
              >
                <Globe className="h-3 w-3 mr-1" />
                {getCompanySlug(companyPage.linkedinPageUrl)}
              </a>
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={companyPage.active ? "default" : "outline"}>
              {companyPage.active ? "Active" : "Inactive"}
            </Badge>
            {hasReposts && (
              <div className="flex items-center text-green-600 text-xs font-medium">
                <Check className="h-3 w-3 mr-1" />
                Reposted
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Repost Frequency:</span>
            <span className="font-medium">{getFrequencyLabel(companyPage.repostFrequency)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Last Checked:</span>
            <span className="font-medium">
              {companyPage.lastChecked 
                ? new Date(companyPage.lastChecked).toLocaleDateString() 
                : 'Never'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 mt-2 border-t">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Auto-Repost:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${companyPage.autoRepost ? 'text-green-600' : 'text-muted-foreground'}`}>
                {companyPage.autoRepost ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={companyPage.autoRepost || false}
                onCheckedChange={(checked) => onToggleAutoRepost(companyPage.id, checked)}
              />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t">
            <a 
              href={getPostsFeedUrl(companyPage.linkedinPageUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-sm font-medium transition-colors"
            >
              <i className="fab fa-linkedin mr-2"></i>
              View Latest Posts
            </a>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onEdit(companyPage)}
        >
          <Pencil className="h-4 w-4 mr-1" />
          Edit
        </Button>
        <Button 
          variant="destructive" 
          size="sm" 
          onClick={() => onDelete(companyPage.id)}
        >
          <Trash className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function Campaigns() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();

  // Form setup for create/edit company page
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pageName: "",
      linkedinPageUrl: "",
      repostFrequency: "weekly",
      active: true,
    },
  });

  // Query to get company pages
  const { data: companyPages, isLoading } = useQuery({
    queryKey: ['/api/company-pages'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company-pages');
      return response.json();
    },
  });

  // Query to get reposts to check which pages have been reposted
  const { data: reposts } = useQuery({
    queryKey: ['/api/reposts'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/reposts');
        return response.json();
      } catch {
        return [];
      }
    },
  });

  // Get set of company page IDs that have reposts
  const repostedPageIds = new Set(
    (reposts || []).map((r: any) => r.companyPageId).filter(Boolean)
  );

  // Mutation to create company page
  const createMutation = useMutation({
    mutationFn: (data: FormValues) => {
      return apiRequest('POST', '/api/company-pages', data);
    },
    onSuccess: () => {
      toast({
        title: "Campaign created",
        description: "Your LinkedIn company page has been added successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company-pages'] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      console.error('Error creating company page:', error);
      toast({
        title: "Failed to create campaign",
        description: "There was a problem adding your LinkedIn company page.",
        variant: "destructive",
      });
    },
  });

  // Mutation to update company page
  const updateMutation = useMutation({
    mutationFn: (data: FormValues & { id: number }) => {
      const { id, ...updateData } = data;
      return apiRequest('PUT', `/api/company-pages/${id}`, updateData);
    },
    onSuccess: () => {
      toast({
        title: "Campaign updated",
        description: "Your LinkedIn company page has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company-pages'] });
      setIsDialogOpen(false);
      setSelectedPage(null);
    },
    onError: (error) => {
      console.error('Error updating company page:', error);
      toast({
        title: "Failed to update campaign",
        description: "There was a problem updating your LinkedIn company page.",
        variant: "destructive",
      });
    },
  });

  // Mutation to delete company page
  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest('DELETE', `/api/company-pages/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Campaign deleted",
        description: "The LinkedIn company page has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company-pages'] });
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
    },
    onError: (error) => {
      console.error('Error deleting company page:', error);
      toast({
        title: "Failed to delete campaign",
        description: "There was a problem removing the LinkedIn company page.",
        variant: "destructive",
      });
    },
  });

  // Mutation to toggle auto-repost
  const toggleAutoRepostMutation = useMutation({
    mutationFn: ({ id, autoRepost }: { id: number; autoRepost: boolean }) => {
      return apiRequest('PUT', `/api/company-pages/${id}`, { autoRepost });
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.autoRepost ? "Auto-repost enabled" : "Auto-repost disabled",
        description: variables.autoRepost 
          ? "New posts from this company will be automatically shared to your feed."
          : "Automatic sharing has been turned off for this company.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company-pages'] });
    },
    onError: (error) => {
      console.error('Error toggling auto-repost:', error);
      toast({
        title: "Failed to update auto-repost",
        description: "There was a problem updating the auto-repost setting.",
        variant: "destructive",
      });
    },
  });

  // Handle toggle auto-repost
  const handleToggleAutoRepost = (id: number, enabled: boolean) => {
    toggleAutoRepostMutation.mutate({ id, autoRepost: enabled });
  };

  // Handle form submission for create/edit
  const onSubmit = (values: FormValues) => {
    if (selectedPage) {
      updateMutation.mutate({ ...values, id: selectedPage.id });
    } else {
      createMutation.mutate(values);
    }
  };

  // Handle edit button
  const handleEditPage = (page: any) => {
    setSelectedPage(page);
    form.reset({
      pageName: page.pageName,
      linkedinPageUrl: page.linkedinPageUrl,
      repostFrequency: page.repostFrequency,
      active: page.active,
    });
    setIsDialogOpen(true);
  };

  // Handle delete button
  const handleDeletePage = (id: number) => {
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  // Handle dialog close
  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedPage(null);
    form.reset();
  };

  // Determine button loading state
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MobileHeader />

      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0 pb-6 px-4 sm:px-6 md:px-8 bg-neutral-50">
        <div className="pt-16 lg:pt-0">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Campaigns</h1>
              <p className="text-neutral-600">Manage your LinkedIn company pages for content amplification</p>
            </div>
            <div className="mt-4 lg:mt-0">
              <Button 
                className="bg-primary hover:bg-primary-600 text-white"
                onClick={() => {
                  setSelectedPage(null);
                  form.reset({
                    pageName: "",
                    linkedinPageUrl: "",
                    repostFrequency: "weekly",
                    active: true,
                  });
                  setIsDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : companyPages && companyPages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companyPages.map((page: any) => (
                <CompanyPageCard 
                  key={page.id} 
                  companyPage={page} 
                  onEdit={handleEditPage}
                  onDelete={handleDeletePage}
                  hasReposts={repostedPageIds.has(page.id)}
                  onToggleAutoRepost={handleToggleAutoRepost}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-lg border border-neutral-200 p-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Globe className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium text-neutral-900 mb-2">No campaigns yet</h3>
              <p className="text-neutral-600 text-center max-w-md mb-4">
                Add your LinkedIn company pages to start amplifying your content through industry influencers.
              </p>
              <Button
                onClick={() => {
                  setSelectedPage(null);
                  form.reset();
                  setIsDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Campaign
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedPage ? "Edit Campaign" : "Create New Campaign"}
            </DialogTitle>
            <DialogDescription>
              {selectedPage 
                ? "Update your LinkedIn company page details" 
                : "Add a LinkedIn company page to amplify its content"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="pageName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Acme Corporation" {...field} />
                    </FormControl>
                    <FormDescription>
                      The name of your company or organization
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="linkedinPageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn Company Page URL</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://www.linkedin.com/company/your-company" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      The full URL to your LinkedIn company page
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="repostFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repost Frequency</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="random">Random</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How often content from this page should be reposted
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active Status</FormLabel>
                      <FormDescription>
                        {field.value 
                          ? "This campaign is currently active" 
                          : "This campaign is currently inactive"}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <div 
                        className={`rounded-full w-12 h-6 p-1 cursor-pointer transition-colors ${
                          field.value ? "bg-primary" : "bg-muted"
                        }`}
                        onClick={() => field.onChange(!field.value)}
                      >
                        <div 
                          className={`rounded-full w-4 h-4 bg-white transform transition-transform ${
                            field.value ? "translate-x-6" : "translate-x-0"
                          }`} 
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDialogClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {selectedPage ? "Update Campaign" : "Create Campaign"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <AlertCircle className="h-5 w-5 mr-2" />
              Delete Campaign
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this campaign? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}