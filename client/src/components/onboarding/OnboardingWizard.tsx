import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { useAuth } from "@/context/AuthContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Step 1: LinkedIn Pages
interface LinkedInPagesFormData {
  pages: { name: string; url: string }[];
}

// Step 2: Reposting Schedule
interface RepostingScheduleFormData {
  schedules: { pageId: number; frequency: "daily" | "weekly" | "all_time" }[];
}

// Step 3: Preferences
interface PreferencesFormData {
  notifyOnReposts: boolean;
  allowAIComments: boolean;
  shareAnalytics: boolean;
}

type OnboardingStep = 1 | 2 | 3;

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  // Form for LinkedIn Pages (Step 1)
  const linkedinPagesSchema = z.object({
    pages: z.array(
      z.object({
        name: z.string().min(2, "Company name is required"),
        url: z.string().min(2, "LinkedIn URL is required")
      })
    ).min(1, "At least one LinkedIn page is required")
  });
  
  const linkedinPagesForm = useForm<LinkedInPagesFormData>({
    resolver: zodResolver(linkedinPagesSchema),
    defaultValues: {
      pages: [
        { name: "", url: "" },
        { name: "", url: "" },
        { name: "", url: "" }
      ]
    }
  });
  
  const [companyPages, setCompanyPages] = useState<Array<{ id: number; name: string; url: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Add more LinkedIn page fields
  const addMorePages = () => {
    const currentPages = linkedinPagesForm.getValues().pages;
    linkedinPagesForm.setValue("pages", [...currentPages, { name: "", url: "" }]);
  };
  
  // Handle step 1 submission
  const handleLinkedInPagesSubmit = async (data: LinkedInPagesFormData) => {
    try {
      setIsSubmitting(true);
      
      // Filter out empty pages
      const validPages = data.pages.filter(page => page.name && page.url);
      
      if (validPages.length === 0) {
        toast({
          title: "Error",
          description: "At least one LinkedIn page is required",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Save pages to the database via API
      const savedPages = [];
      for (const page of validPages) {
        try {
          const response = await apiRequest("POST", "/api/company-pages", {
            pageName: page.name,
            linkedinPageUrl: page.url.startsWith("http") ? page.url : `https://linkedin.com/company/${page.url}`,
            repostFrequency: "daily",
            active: true
          });
          const savedPage = await response.json();
          savedPages.push({
            id: savedPage.id,
            name: savedPage.pageName,
            url: savedPage.linkedinPageUrl
          });
        } catch (err) {
          console.error("Error saving page:", page.name, err);
        }
      }
      
      if (savedPages.length === 0) {
        toast({
          title: "Error",
          description: "Failed to save LinkedIn pages. Please try again.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      setCompanyPages(savedPages);
      queryClient.invalidateQueries({ queryKey: ["/api/company-pages"] });
      
      toast({
        title: "Saved",
        description: `${savedPages.length} LinkedIn page(s) saved successfully.`,
      });
      
      // Move to next step
      setCurrentStep(2);
      setIsSubmitting(false);
    } catch (error) {
      console.error("Error saving LinkedIn pages:", error);
      toast({
        title: "Error",
        description: "Failed to save LinkedIn pages. Please try again.",
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
  };
  
  // Handle step 2 submission (Reposting Schedule)
  const handleRepostingScheduleSubmit = () => {
    // In a real app, we would save the reposting schedule to the backend
    // For this MVP, we'll just move to the next step
    setCurrentStep(3);
  };
  
  // Handle step 3 submission (Preferences)
  const handlePreferencesSubmit = async () => {
    try {
      setIsSubmitting(true);
      
      // In a real app, we would save the preferences to the backend
      // For this MVP, we'll simulate updating the user's company field
      
      if (user) {
        await updateUser({
          ...user,
          company: "TechCorp Inc." // This would come from the form in a real app
        });
        
        // Invalidate any queries that depend on user data
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        
        toast({
          title: "Onboarding Complete",
          description: "Your NexaShare account is now ready to use.",
        });
        
        // Redirect to dashboard after completing onboarding
        setLocation("/");
      }
      
      setIsSubmitting(false);
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast({
        title: "Error",
        description: "Failed to complete onboarding. Please try again.",
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="max-w-3xl mx-auto bg-white shadow-md rounded-lg overflow-hidden">
      <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Complete Your Setup</h2>
            <p className="text-neutral-600 text-sm">Let's configure NexaShare for your business</p>
          </div>
          <a 
            href="/"
            onClick={(e) => {
              e.preventDefault();
              if (user) {
                updateUser({ ...user, company: "Skipped" } as any);
              }
              setLocation("/");
            }}
            className="text-sm text-primary hover:text-primary-dark hover:underline"
          >
            Skip to Dashboard →
          </a>
        </div>
      </div>
      
      <div className="flex mb-8 px-6 pt-6">
        {/* Stepper */}
        <div className="flex items-center w-full">
          <div className="relative flex flex-col items-center">
            <div className={`rounded-full h-10 w-10 flex items-center justify-center font-medium ${
              currentStep >= 1 ? "bg-primary text-white" : "bg-neutral-200 text-neutral-600"
            }`}>
              1
            </div>
            <div className={`text-xs font-medium mt-2 ${
              currentStep >= 1 ? "text-primary" : "text-neutral-500"
            }`}>
              LinkedIn Pages
            </div>
          </div>
          <div className={`flex-1 border-t-2 ${
            currentStep >= 2 ? "border-primary" : "border-neutral-200"
          }`}></div>
          <div className="relative flex flex-col items-center">
            <div className={`rounded-full h-10 w-10 flex items-center justify-center font-medium ${
              currentStep >= 2 ? "bg-primary text-white" : "bg-neutral-200 text-neutral-600"
            }`}>
              2
            </div>
            <div className={`text-xs font-medium mt-2 ${
              currentStep >= 2 ? "text-primary" : "text-neutral-500"
            }`}>
              Reposting Schedule
            </div>
          </div>
          <div className={`flex-1 border-t-2 ${
            currentStep >= 3 ? "border-primary" : "border-neutral-200"
          }`}></div>
          <div className="relative flex flex-col items-center">
            <div className={`rounded-full h-10 w-10 flex items-center justify-center font-medium ${
              currentStep >= 3 ? "bg-primary text-white" : "bg-neutral-200 text-neutral-600"
            }`}>
              3
            </div>
            <div className={`text-xs font-medium mt-2 ${
              currentStep >= 3 ? "text-primary" : "text-neutral-500"
            }`}>
              Preferences
            </div>
          </div>
        </div>
      </div>
      
      <div className="px-6 pb-6">
        {/* Step 1: LinkedIn Pages */}
        {currentStep === 1 && (
          <>
            <h3 className="text-lg font-medium text-neutral-900 mb-4">Add LinkedIn Pages to Monitor</h3>
            <p className="text-neutral-600 mb-6">Enter up to 5 LinkedIn company page URLs you'd like to track for content amplification</p>
            
            <Form {...linkedinPagesForm}>
              <form onSubmit={linkedinPagesForm.handleSubmit(handleLinkedInPagesSubmit)}>
                <div className="space-y-4">
                  {linkedinPagesForm.watch("pages").map((_, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-1">
                        <FormField
                          control={linkedinPagesForm.control}
                          name={`pages.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-neutral-700">Company Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="TechCorp Inc." 
                                  className="w-full px-3 py-2 border border-neutral-300 rounded-md" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <FormField
                          control={linkedinPagesForm.control}
                          name={`pages.${index}.url`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-neutral-700">LinkedIn Company Page URL</FormLabel>
                              <FormControl>
                                <div className="mt-1 flex rounded-md shadow-sm">
                                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-sm">
                                    linkedin.com/company/
                                  </span>
                                  <Input 
                                    placeholder="company-name" 
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-neutral-300" 
                                    {...field} 
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                  
                  {linkedinPagesForm.watch("pages").length < 5 && (
                    <Button 
                      type="button" 
                      variant="link" 
                      className="text-primary p-0 h-auto" 
                      onClick={addMorePages}
                    >
                      <i className="fas fa-plus mr-2"></i> Add more pages
                    </Button>
                  )}
                </div>
                
                <div className="mt-8 flex justify-end">
                  <Button 
                    type="submit" 
                    className="bg-primary hover:bg-primary-dark text-white" 
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving..." : "Continue"}
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}
        
        {/* Step 2: Reposting Schedule */}
        {currentStep === 2 && (
          <>
            <h3 className="text-lg font-medium text-neutral-900 mb-4">Set Reposting Schedule</h3>
            <p className="text-neutral-600 mb-6">Choose how frequently you want to repost content from each LinkedIn page</p>
            
            <div className="space-y-6">
              {companyPages.map(page => (
                <div key={page.id} className="border border-neutral-200 rounded-lg p-4">
                  <h4 className="font-medium text-neutral-800 mb-2">{page.name}</h4>
                  <p className="text-sm text-neutral-500 mb-4">linkedin.com/company/{page.url}</p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id={`daily-${page.id}`} 
                        name={`schedule-${page.id}`} 
                        value="daily" 
                        className="mr-2" 
                        defaultChecked 
                      />
                      <label htmlFor={`daily-${page.id}`} className="text-neutral-700">Daily</label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id={`weekly-${page.id}`} 
                        name={`schedule-${page.id}`} 
                        value="weekly" 
                        className="mr-2" 
                      />
                      <label htmlFor={`weekly-${page.id}`} className="text-neutral-700">Weekly</label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id={`alltime-${page.id}`} 
                        name={`schedule-${page.id}`} 
                        value="all_time" 
                        className="mr-2" 
                      />
                      <label htmlFor={`alltime-${page.id}`} className="text-neutral-700">All the time (as soon as new content is posted)</label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 flex justify-between">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setCurrentStep(1)}
              >
                Back
              </Button>
              <Button 
                type="button" 
                className="bg-primary hover:bg-primary-dark text-white" 
                onClick={handleRepostingScheduleSubmit}
              >
                Continue
              </Button>
            </div>
          </>
        )}
        
        {/* Step 3: Preferences */}
        {currentStep === 3 && (
          <>
            <h3 className="text-lg font-medium text-neutral-900 mb-4">Customize Your Preferences</h3>
            <p className="text-neutral-600 mb-6">Set your preferences for notifications, AI suggestions, and analytics</p>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-neutral-800">Notifications</h4>
                  <p className="text-sm text-neutral-500">Receive notifications when your content is reposted</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-neutral-800">AI Comment Suggestions</h4>
                  <p className="text-sm text-neutral-500">Allow AI to generate comment suggestions for reposts</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-neutral-800">Analytics Sharing</h4>
                  <p className="text-sm text-neutral-500">Share anonymized usage data to improve the platform</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
            
            <div className="mt-8 flex justify-between">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setCurrentStep(2)}
              >
                Back
              </Button>
              <Button 
                type="button" 
                className="bg-primary hover:bg-primary-dark text-white" 
                onClick={handlePreferencesSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Completing Setup..." : "Complete Setup"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
