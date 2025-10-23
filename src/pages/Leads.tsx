import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Eye, Edit, Trash2 } from 'lucide-react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Lead {
  id: string;
  director_first_name: string;
  director_last_name: string;
  director_email: string;
  director_phone_number: string;
  status: string;
  last_communication_date: string;
  follow_up_count: number;
  estimated_performers: number;
  ensemble_program_name: string;
  created_at: string;
}

const Leads = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  useEffect(() => {
    filterLeads();
  }, [leads, searchTerm, statusFilter]);

  const fetchLeads = async () => {
    try {
      setRefreshing(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast({
        title: "Error",
        description: "Failed to fetch leads",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterLeads = () => {
    let filtered = leads;

    if (searchTerm) {
      filtered = filtered.filter(lead =>
        lead.director_first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.director_last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.director_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.ensemble_program_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(lead => lead.status === statusFilter);
    }

    setFilteredLeads(filtered);
  };

  const handleDeleteLead = async (leadId: string) => {
    try {
      setDeletingLeadId(leadId);
      
      // Delete communication history first (foreign key constraint)
      const { error: commError } = await supabase
        .from('communication_history')
        .delete()
        .eq('lead_id', leadId);

      if (commError) {
        console.error('Error deleting communication history:', commError);
        // Continue with lead deletion even if communication history deletion fails
      }

      // Delete the lead
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Lead deleted successfully",
      });

      // Refresh the leads list
      fetchLeads();
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast({
        title: "Error",
        description: "Failed to delete lead",
        variant: "destructive",
      });
    } finally {
      setDeletingLeadId(null);
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
          <p className="mt-4 text-muted-foreground">Loading leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 bg-background min-h-screen">
      {/* Page Header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Lead Management</h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Manage and track all your leads in one place
        </p>
      </div>

      {/* Leads Table */}
      <Card className="premium-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">All Leads</CardTitle>
            <div className="flex gap-2">
              <Button 
                onClick={fetchLeads} 
                variant="outline"
                disabled={refreshing}
                className="premium-button"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button onClick={() => navigate('/new-lead')} className="premium-button">
                <Plus className="h-4 w-4 mr-2" />
                New Lead
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads by name, email, or program..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 premium-input"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[220px] h-11 premium-input">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="New Lead">New Lead</SelectItem>
                <SelectItem value="Quote Sent">Quote Sent</SelectItem>
                <SelectItem value="Reply Received - Awaiting Action">Reply Awaiting Action</SelectItem>
                <SelectItem value="Follow-up Sent 1">Follow-up 1</SelectItem>
                <SelectItem value="Follow-up Sent 2">Follow-up 2</SelectItem>
                <SelectItem value="Follow-up Sent 3">Follow-up 3</SelectItem>
                <SelectItem value="Follow-up Sent 4">Follow-up 4</SelectItem>
                <SelectItem value="Invoice Sent">Invoice Sent</SelectItem>
                <SelectItem value="Converted - Paid">Converted - Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold text-foreground">Lead Name</TableHead>
                  <TableHead className="font-semibold text-foreground">Email</TableHead>
                  <TableHead className="font-semibold text-foreground">Phone</TableHead>
                  <TableHead className="font-semibold text-foreground">Program</TableHead>
                  <TableHead className="font-semibold text-foreground">Performers</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">Follow-ups</TableHead>
                  <TableHead className="font-semibold text-foreground">Last Contact</TableHead>
                  <TableHead className="font-semibold text-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow key={lead.id} className="hover:bg-muted/30 transition-colors duration-200">
                    <TableCell className="font-medium text-foreground">
                      {lead.director_first_name} {lead.director_last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lead.director_email}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.director_phone_number}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.ensemble_program_name}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.estimated_performers}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(lead.status)} className="text-xs font-medium">
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lead.follow_up_count}</TableCell>
                    <TableCell>
                      {lead.last_communication_date ? formatDate(lead.last_communication_date) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/lead/${lead.id}`)}
                          className="h-8 w-8 p-0 rounded-lg hover:bg-accent/80"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/lead/${lead.id}/edit`)}
                          className="h-8 w-8 p-0 rounded-lg hover:bg-accent/80"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {lead.director_first_name} {lead.director_last_name}? 
                                This action cannot be undone and will also delete all communication history.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteLead(lead.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={deletingLeadId === lead.id}
                              >
                                {deletingLeadId === lead.id ? 'Deleting...' : 'Delete Lead'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredLeads.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No leads found matching your criteria.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Leads;