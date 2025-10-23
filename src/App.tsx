import { useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SettingsProvider, useSettings } from "@/hooks/useSettings";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LayoutDashboard, Users, Zap, Settings as SettingsIcon, ChartBar as BarChart3, FileText, LogOut, Building2, ChevronRight, ScrollText } from "lucide-react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import LeadDetail from "./pages/LeadDetail";
import NewLead from "./pages/NewLead";
import Settings from "./pages/Settings";
import WebhookLogs from "./pages/WebhookLogs";
import EmailTemplates from "./pages/EmailTemplates";
import EmailComposer from "./components/EmailComposer";
import AutomationDashboard from "./components/AutomationDashboard";
import IntegrationHub from "./components/IntegrationHub";
import ReportsAnalytics from "./components/ReportsAnalytics";
import SystemLogs from "./pages/SystemLogs";
import NotFound from "./pages/NotFound";
import TestFollowUp from "./pages/TestFollowUp";

const queryClient = new QueryClient();

// Navigation items for the sidebar
const navigationItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Leads",
    url: "/leads",
    icon: Users,
  },
  {
    title: "Automation",
    url: "/automation",
    icon: Zap,
  },
  {
    title: "Integrations",
    url: "/integrations",
    icon: Building2,
  },
  {
    title: "Reports & Analytics",
    url: "/reports",
    icon: BarChart3,
  },
  {
    title: "Templates",
    url: "/settings/email-templates",
    icon: FileText,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: SettingsIcon,
  },
];

// Logs submenu items
const logsSubmenuItems = [
  {
    title: "System Logs",
    url: "/logs",
  },
  {
    title: "Webhook Logs", 
    url: "/webhook-logs",
  },
];

// Sidebar Navigation Component
const AppSidebar = () => {
  const { user, signOut } = useAuth();
  const { companySettings } = useSettings();
  const location = useLocation();
  const [logsOpen, setLogsOpen] = useState(false); 

  const handleLogout = async () => {
    await signOut();
  };

  const getUserInitials = (email: string) => {
    return email.split('@')[0].slice(0, 2).toUpperCase();
  };

  // Check if current path is in logs section
  const isLogsActive = location.pathname === '/logs' || location.pathname === '/webhook-logs';

  return (
    <Sidebar className="premium-sidebar border-r border-sidebar-border/30">
      <SidebarHeader className="border-b border-sidebar-border/30 bg-sidebar/50">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sidebar-foreground text-sm">{companySettings?.company_name || 'Client Company'}</span>
            <span className="text-xs text-sidebar-foreground/60">LeadSense CRM</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-2 text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="px-2">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    className="h-10 px-3 rounded-lg font-medium transition-all duration-200 hover:bg-sidebar-accent/80"
                  >
                    <a href={item.url}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              
              {/* Logs Dropdown Menu */}
              <SidebarMenuItem>
                <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className={`h-10 px-3 rounded-lg font-medium transition-all duration-200 hover:bg-sidebar-accent/80 w-full justify-between ${
                        isLogsActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ScrollText className="h-4 w-4 shrink-0" />
                        <span>Logs</span>
                      </div>
                      <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${logsOpen ? 'rotate-90' : ''}`} />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="ml-4 mt-1">
                      {logsSubmenuItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location.pathname === item.url}
                            className="h-8 px-3 rounded-md text-sm font-normal transition-all duration-200"
                          >
                            <a href={item.url}>
                              <span>{item.title}</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter className="border-t border-sidebar-border/30 bg-sidebar/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar className="h-8 w-8 ring-2 ring-sidebar-border/30">
                <AvatarFallback className="text-xs">
                  {user?.email ? getUserInitials(user.email) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground/90 truncate">
                  {user?.email}
                </p>
                <p className="text-xs text-sidebar-foreground/60">Admin</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-8 w-8 p-0 hover:bg-sidebar-accent/80 rounded-lg transition-all duration-200"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  return user ? <>{children}</> : <Navigate to="/auth" replace />;
};

// Main App Layout with Sidebar
const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <div className="flex h-full flex-col">
            <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border/30 px-6 bg-card/50 backdrop-blur-sm">
              <SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent/80 transition-all duration-200" />
              <div className="flex-1" />
            </header>
            <main className="flex-1 overflow-auto bg-background">
              {children}
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SettingsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              {/* The corrected, flattened route structure */}
              <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute><AppLayout><Leads /></AppLayout></ProtectedRoute>} />
              <Route path="/lead/:id" element={<ProtectedRoute><AppLayout><LeadDetail /></AppLayout></ProtectedRoute>} />
              <Route path="/lead/:id/edit" element={<ProtectedRoute><AppLayout><NewLead /></AppLayout></ProtectedRoute>} />
              <Route path="/new-lead" element={<ProtectedRoute><AppLayout><NewLead /></AppLayout></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
              <Route path="/webhook-logs" element={<ProtectedRoute><AppLayout><WebhookLogs /></AppLayout></ProtectedRoute>} />
              <Route path="/test-followup" element={<ProtectedRoute><AppLayout><TestFollowUp /></AppLayout></ProtectedRoute>} />
              <Route path="/settings/email-templates" element={<ProtectedRoute><AppLayout><EmailTemplates /></AppLayout></ProtectedRoute>} />
              <Route path="/email-composer" element={<ProtectedRoute><AppLayout><EmailComposer /></AppLayout></ProtectedRoute>} />
              <Route path="/automation" element={<ProtectedRoute><AppLayout><AutomationDashboard /></AppLayout></ProtectedRoute>} />
              <Route path="/integrations" element={<ProtectedRoute><AppLayout><IntegrationHub /></AppLayout></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><AppLayout><ReportsAnalytics /></AppLayout></ProtectedRoute>} />
              <Route path="/logs" element={<ProtectedRoute><AppLayout><SystemLogs /></AppLayout></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SettingsProvider>
    </AuthProvider>
  </QueryClientProvider>
); 

export default App;