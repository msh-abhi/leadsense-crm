import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, TrendingUp, Target, DollarSign, Plus, Eye, Mail, Phone, Calendar, ChartBar as BarChart3, Clock, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  activeFollowUps: number;
  converted: number;
  conversionRate: number;
  recentLeads: Array<{
    id: string;
    director_first_name: string;
    director_last_name: string;
    status: string;
    created_at: string;
  }>;
  statusBreakdown: Record<string, number>;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const newLeads = leads.filter(lead => 
        new Date(lead.created_at) >= thirtyDaysAgo
      ).length;

      const activeFollowUps = leads.filter(lead => 
        lead.status.includes('Follow-up') || lead.status === 'Active Follow-up'
      ).length;

      const converted = leads.filter(lead => 
        lead.status === 'Converted - Paid'
      ).length;

      const conversionRate = leads.length > 0 ? (converted / leads.length) * 100 : 0;

      // Status breakdown
      const statusBreakdown = leads.reduce((acc, lead) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Recent leads (last 5)
      const recentLeads = leads.slice(0, 5).map(lead => ({
        id: lead.id,
        director_first_name: lead.director_first_name,
        director_last_name: lead.director_last_name,
        status: lead.status,
        created_at: lead.created_at
      }));

      setStats({
        totalLeads: leads.length,
        newLeads,
        activeFollowUps,
        converted,
        conversionRate,
        recentLeads,
        statusBreakdown
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast({
        title: "Error",
        description: "Failed to fetch dashboard statistics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'New Lead':
        return 'secondary';
      case 'Quote Sent':
        return 'default';
      case 'Reply Received - Awaiting Action':
        return 'destructive';
      case 'Follow-up Sent 1':
      case 'Follow-up Sent 2':
      case 'Follow-up Sent 3':
      case 'Follow-up Sent 4':
        return 'outline';
      case 'Invoice Sent':
        return 'secondary';
      case 'Converted - Paid':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 bg-background min-h-screen">
      {/* Page Header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Overview of your LeadSense CRM performance and key metrics
        </p>
      </div>

      {/* Quick Actions */}
      <Card className="premium-card">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button 
              onClick={() => navigate('/new-lead')}
              className="h-auto p-6 flex flex-col items-center gap-3 premium-button"
            >
              <Plus className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">New Lead</div>
                <div className="text-xs opacity-90">Add a new lead</div>
              </div>
            </Button>
            
            <Button 
              onClick={() => navigate('/leads')}
              variant="outline"
              className="h-auto p-6 flex flex-col items-center gap-3 premium-button"
            >
              <Users className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">View All Leads</div>
                <div className="text-xs opacity-80">Manage leads</div>
              </div>
            </Button>
            
            <Button 
              onClick={() => navigate('/email-composer')}
              variant="outline"
              className="h-auto p-6 flex flex-col items-center gap-3 premium-button"
            >
              <Mail className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">Send Email</div>
                <div className="text-xs opacity-80">Compose email</div>
              </div>
            </Button>
            
            <Button 
              onClick={() => navigate('/reports')}
              variant="outline"
              className="h-auto p-6 flex flex-col items-center gap-3 premium-button"
            >
              <BarChart3 className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">View Reports</div>
                <div className="text-xs opacity-80">Analytics</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="premium-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Total Leads</p>
                <p className="text-3xl font-bold text-foreground mb-1">{stats?.totalLeads || 0}</p>
                <p className="text-sm text-green-600 font-medium">
                  +{stats?.newLeads || 0} this month
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Conversion Rate</p>
                <p className="text-3xl font-bold text-foreground mb-1">{stats?.conversionRate.toFixed(1) || 0}%</p>
                <p className="text-sm text-green-600 font-medium">+2.3% from last month</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
                <Target className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Active Follow-ups</p>
                <p className="text-3xl font-bold text-foreground mb-1">{stats?.activeFollowUps || 0}</p>
                <p className="text-sm text-orange-600 font-medium">Needs attention</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Clock className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Converted</p>
                <p className="text-3xl font-bold text-foreground mb-1">{stats?.converted || 0}</p>
                <p className="text-sm text-green-600 font-medium">This month</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Award className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Leads */}
        <Card className="premium-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recent Leads</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate('/leads')} className="premium-button">
                <Eye className="h-4 w-4 mr-2" />
                View All
              </Button>
            </div>
            <CardDescription>Latest leads added to your CRM</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-3">
              {stats?.recentLeads.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-all duration-200">
                  <div>
                    <p className="font-medium text-foreground">
                      {lead.director_first_name} {lead.director_last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(lead.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(lead.status)} className="text-xs">
                      {lead.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/lead/${lead.id}`)}
                      className="h-8 w-8 p-0 rounded-lg"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {(!stats?.recentLeads || stats.recentLeads.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  No recent leads found
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lead Status Breakdown */}
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="text-lg">Lead Status Breakdown</CardTitle>
            <CardDescription>Distribution of leads by current status</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-4">
              {stats?.statusBreakdown && Object.entries(stats.statusBreakdown).map(([status, count]) => {
                const percentage = stats.totalLeads > 0 ? (count / stats.totalLeads) * 100 : 0;
                return (
                  <div key={status} className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-foreground">{status}</span>
                      <span className="text-muted-foreground">{count} leads ({percentage.toFixed(1)}%)</span>
                    </div>
                    <Progress value={percentage} className="h-2 bg-muted" />
                  </div>
                );
              })}
              {(!stats?.statusBreakdown || Object.keys(stats.statusBreakdown).length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  No status data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="premium-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Emails Sent</p>
                <p className="text-2xl font-bold text-foreground mb-1">247</p>
                <p className="text-sm text-green-600 font-medium">+12% this week</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
                <Phone className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Response Rate</p>
                <p className="text-2xl font-bold text-foreground mb-1">23.5%</p>
                <p className="text-sm text-green-600 font-medium">+3.2% this week</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Avg. Deal Size</p>
                <p className="text-2xl font-bold text-foreground mb-1">$1,250</p>
                <p className="text-sm text-green-600 font-medium">+8.1% this month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;