import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowLeft, Mail, Phone, Calendar, DollarSign, Building, Users, Clock, FileText, Send, CheckCircle, Edit, MessageSquare, ArrowUpRight, ArrowDownLeft, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import EmailComposer from '@/components/EmailComposer';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
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
  director_phone_number?: string;
  ensemble_program_name?: string;
  workout_program_name?: string;
  school_name?: string;
  estimated_performers?: number;
  season?: string;
  form_submission_date: string;
  early_bird_deadline?: string;
  standard_rate_sr?: number;
  discount_rate_dr?: number;
  savings?: number;
  status: string;
  quote_sent_date?: string;
  last_email_sent_type?: string;
  last_sms_sent_type?: string;
  reply_detected: boolean;
  last_reply_content?: string;
  invoice_status?: string;
  payment_date?: string;
  last_communication_date?: string;
  follow_up_count: number;
  quickbooks_customer_id?: string;
  quickbooks_invoice_id?: string;
  quickbooks_invoice_number?: string;
  quickbooks_payment_link?: string;
  ai_suggested_message?: string;
  created_at: string;
  updated_at: string;
}

interface CommunicationHistory {
  id: string;
  communication_type: string;
  direction: 'inbound' | 'outbound' | 'internal' | 'scheduled';
  subject?: string;
  content: string;
  sent_at: string;
  external_id?: string;
  metadata?: any;
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead | null>(null);
  const [communications, setCommunications] = useState<CommunicationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCommunications, setLoadingCommunications] = useState(true);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const statusOptions = [
    'New Lead',
    'Quote Sent',
    'Active Follow-up',
    'Follow-up Sent 1',
    'Follow-up Sent 2',
    'Follow-up Sent 3',
    'Follow-up Sent 4',
    'Reply Received - Awaiting Action',
    'Invoice Sent',
    'Converted - Paid',
    'Inactive'
  ];

  useEffect(() => {
    if (id) {
      fetchLeadDetails();
      fetchCommunicationHistory();
    }
  }, [id]);

  const fetchLeadDetails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setLead(data);
    } catch (error) {
      console.error('Error fetching lead details:', error);
      toast({
        title: "Error",
        description: "Failed to fetch lead details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunicationHistory = async () => {
    try {
      setLoadingCommunications(true);
      const { data, error } = await supabase
        .from('communication_history')
        .select('*')
        .eq('lead_id', id)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      setCommunications(data || []);
    } catch (error) {
      console.error('Error fetching communication history:', error);
      toast({
        title: "Error",
        description: "Failed to fetch communication history",
        variant: "destructive",
      });
    } finally {
      setLoadingCommunications(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!lead) return;

    try {
      setIsCreatingInvoice(true);
      const { error } = await supabase.functions.invoke('quickbooks-conversion', {
        body: { leadId: lead.id }
      });

      if (error) {
        const errorMessage = (error as any).context?.error?.message || "Failed to create invoice in QuickBooks";
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Invoice created successfully in QuickBooks",
      });

      await fetchLeadDetails();
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      toast({
        title: "Invoice Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const handleSendInvoice = async () => {
    if (!lead?.quickbooks_invoice_id || !lead.director_email) {
      console.error('Cannot send invoice - missing required data:', {
        hasInvoiceId: !!lead?.quickbooks_invoice_id,
        hasEmail: !!lead?.director_email,
        emailValue: lead?.director_email
      });
      toast({
        title: "Cannot Send Invoice",
        description: "Lead is missing required email address or invoice ID",
        variant: "destructive",
      });
      return;
    }

    console.log('Sending invoice with data:', {
      invoiceId: lead.quickbooks_invoice_id,
      recipientEmail: lead.director_email,
      leadId: lead.id
    });

    try {
      setIsSendingInvoice(true);
      const { error } = await supabase.functions.invoke('quickbooks-send-invoice', {
        body: {
          invoiceId: lead.quickbooks_invoice_id,
          leadId: lead.id,
          recipientEmail: lead.director_email
        }
      });

      if (error) {
         const errorMessage = (error as any).context?.error?.message || "Failed to send invoice";
         throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Invoice has been sent successfully.",
      });

      await fetchLeadDetails();
    } catch (error: any) {
      console.error('Error sending invoice:', error);
      toast({
        title: "Send Invoice Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!newStatus || newStatus === lead?.status) {
      toast({
        title: "No Change",
        description: "Please select a different status",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUpdatingStatus(true);
      
      const { error } = await supabase
        .from('leads')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          // If manually converting to paid, set payment date
          ...(newStatus === 'Converted - Paid' && { 
            payment_date: new Date().toISOString(),
            invoice_status: 'paid'
          })
        })
        .eq('id', lead?.id);

      if (error) throw error;

      // Log the status change
      await supabase
        .from('communication_history')
        .insert({
          lead_id: lead?.id,
          communication_type: 'status_change',
          direction: 'internal',
          subject: `Status manually updated to ${newStatus}`,
          content: `Lead status manually changed from "${lead?.status}" to "${newStatus}"`,
          sent_at: new Date().toISOString(),
          metadata: {
            old_status: lead?.status,
            new_status: newStatus,
            change_type: 'manual'
          }
        });

      toast({
        title: "Success",
        description: `Lead status updated to ${newStatus}`,
      });

      await fetchLeadDetails();
      await fetchCommunicationHistory();
      setNewStatus('');
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update lead status",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!lead) return;

    try {
      setIsDeleting(true);
      
      // Delete communication history first (foreign key constraint)
      const { error: commError } = await supabase
        .from('communication_history')
        .delete()
        .eq('lead_id', lead.id);

      if (commError) {
        console.error('Error deleting communication history:', commError);
        // Continue with lead deletion even if communication history deletion fails
      }

      // Delete the lead
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', lead.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Lead deleted successfully",
      });

      // Navigate back to leads list
      navigate('/leads');
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast({
        title: "Error",
        description: "Failed to delete lead",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getCommunicationIcon = (type: string, direction: string) => {
    if (direction === 'inbound') {
      return <ArrowDownLeft className="h-4 w-4 text-green-600" />;
    } else if (direction === 'outbound') {
      return <ArrowUpRight className="h-4 w-4 text-blue-600" />;
    } else {
      return <MessageSquare className="h-4 w-4 text-gray-500" />;
    }
  };

  const getCommunicationTypeLabel = (type: string) => {
    switch (type) {
      case 'email':
        return 'Email';
      case 'sms':
        return 'SMS';
      case 'call':
        return 'Phone Call';
      case 'meeting':
        return 'Meeting';
      case 'invoice':
        return 'Invoice';
      case 'payment':
        return 'Payment';
      case 'status_change':
        return 'Status Change';
      case 'scheduled_follow_up':
        return 'Scheduled Follow-up';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'new lead':
        return 'bg-blue-100 text-blue-800';
      case 'contacted':
        return 'bg-yellow-100 text-yellow-800';
      case 'quoted':
      case 'invoice created':
        return 'bg-purple-100 text-purple-800';
      case 'converted':
        return 'bg-green-100 text-green-800';
      case 'lost':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Lead not found</h2>
          <Button onClick={() => navigate('/leads')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Leads
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <Button onClick={() => navigate('/leads')} variant="outline" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Leads
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {lead.director_first_name} {lead.director_last_name}
            </h1>
            <p className="text-muted-foreground">
              {lead.school_name || lead.ensemble_program_name || lead.workout_program_name}
            </p>
          </div>
          <Badge className={getStatusColor(lead.status)}>
            {lead.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Mail className="h-5 w-5 mr-2" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="font-medium">{lead.director_email}</p>
                </div>
                {lead.director_phone_number && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Phone</label>
                    <p className="font-medium">{lead.director_phone_number}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Program Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building className="h-5 w-5 mr-2" />
                Program Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lead.school_name && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">School</label>
                    <p className="font-medium">{lead.school_name}</p>
                  </div>
                )}
                {lead.ensemble_program_name && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Ensemble Program</label>
                    <p className="font-medium">{lead.ensemble_program_name}</p>
                  </div>
                )}
                {lead.workout_program_name && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Workout Program</label>
                    <p className="font-medium">{lead.workout_program_name}</p>
                  </div>
                )}
                {lead.estimated_performers && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Estimated Performers</label>
                    <p className="font-medium flex items-center">
                      <Users className="h-4 w-4 mr-1" />
                      {lead.estimated_performers}
                    </p>
                  </div>
                )}
                {lead.season && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Season</label>
                    <p className="font-medium">{lead.season}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pricing Information */}
          {(lead.standard_rate_sr || lead.discount_rate_dr || lead.savings) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <DollarSign className="h-5 w-5 mr-2" />
                  Pricing Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {lead.standard_rate_sr && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Standard Rate</label>
                      <p className="font-medium text-lg">${lead.standard_rate_sr}</p>
                    </div>
                  )}
                  {lead.discount_rate_dr && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Discount Rate</label>
                      <p className="font-medium text-lg text-green-600">${lead.discount_rate_dr}</p>
                    </div>
                  )}
                  {lead.savings && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Savings</label>
                      <p className="font-medium text-lg text-green-600">${lead.savings}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Communication History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="h-5 w-5 mr-2" />
                Communication History
              </CardTitle>
              <CardDescription>
                All email, SMS, and other communications with this lead
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCommunications ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : communications.length > 0 ? (
                <div className="space-y-4">
                  {communications.map((comm) => (
                    <div key={comm.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getCommunicationIcon(comm.communication_type, comm.direction)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {getCommunicationTypeLabel(comm.communication_type)}
                              </span>
                              <Badge variant={comm.direction === 'inbound' ? 'default' : 'secondary'}>
                                {comm.direction === 'inbound' ? 'Received' : 
                                 comm.direction === 'outbound' ? 'Sent' : 
                                 comm.direction === 'internal' ? 'Internal' : 'Scheduled'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(comm.sent_at), 'PPp')}
                            </p>
                          </div>
                        </div>
                        {comm.direction === 'inbound' && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            Reply Detected
                          </Badge>
                        )}
                      </div>
                      
                      {comm.subject && (
                        <div className="mb-2">
                          <span className="text-sm font-medium">Subject: </span>
                          <span className="text-sm">{comm.subject}</span>
                        </div>
                      )}
                      
                      <div className="bg-muted/50 p-3 rounded text-sm">
                        <pre className="whitespace-pre-wrap font-sans">{comm.content}</pre>
                      </div>
                      
                      {comm.metadata && Object.keys(comm.metadata).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            View metadata
                          </summary>
                          <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                            {JSON.stringify(comm.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No communication history found for this lead.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Suggested Message */}
          {lead.ai_suggested_message && (
            <Card>
              <CardHeader>
                <CardTitle>AI Suggested Message</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm bg-muted p-4 rounded-lg">{lead.ai_suggested_message}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Primary Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Primary Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                onClick={() => setShowEmailComposer(true)} 
                className="w-full"
              >
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
              
              <Button 
                onClick={() => navigate(`/lead/${lead.id}/edit`)}
                variant="outline"
                className="w-full"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Lead
              </Button>
              
              <Button
                onClick={handleCreateInvoice}
                disabled={isCreatingInvoice || !!lead.quickbooks_invoice_id}
                className="w-full"
                variant={lead.quickbooks_invoice_id ? "secondary" : "default"}
              >
                {isCreatingInvoice ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : lead.quickbooks_invoice_id ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                {lead.quickbooks_invoice_id ? "Invoice Created" : "Create Invoice"}
              </Button>

              {lead.quickbooks_invoice_id && (
                <Button
                  onClick={handleSendInvoice}
                  disabled={isSendingInvoice || lead.invoice_status === 'sent_with_payment_link' || !lead.director_email || !lead.quickbooks_payment_link}
                  className="w-full"
                  variant={lead.invoice_status === 'sent_with_payment_link' ? "secondary" : "default"}
                >
                  {isSendingInvoice ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : lead.invoice_status === 'sent_with_payment_link' ? (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {lead.invoice_status === 'sent_with_payment_link' ? "Invoice Sent" : 
                   !lead.director_email ? "No Email Address" : 
                   !lead.quickbooks_payment_link ? "No Payment Link" : "Send Invoice"}
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="w-full"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Lead
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {lead.director_first_name} {lead.director_last_name}? 
                      This action cannot be undone and will also delete all communication history, 
                      QuickBooks data, and any associated records.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteLead}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Lead'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Manual Status Update */}
          <Card>
            <CardHeader>
              <CardTitle>Update Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="status-select">Change Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select new status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleStatusUpdate}
                disabled={isUpdatingStatus || !newStatus || newStatus === lead.status}
                className="w-full"
                variant="outline"
              >
                {isUpdatingStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Edit className="h-4 w-4 mr-2" />
                )}
                Update Status
              </Button>
            </CardContent>
          </Card>

          {/* QuickBooks Information */}
          <Card>
            <CardHeader>
              <CardTitle>QuickBooks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lead.quickbooks_customer_id && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Customer ID</label>
                  <p className="font-medium">{lead.quickbooks_customer_id}</p>
                </div>
              )}
              {lead.quickbooks_invoice_id && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Invoice ID</label>
                  <p className="font-medium">{lead.quickbooks_invoice_id}</p>
                </div>
              )}
              {lead.quickbooks_invoice_number && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Invoice Number</label>
                  <p className="font-medium">{lead.quickbooks_invoice_number}</p>
                </div>
              )}
              {lead.quickbooks_payment_link && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Payment Link</label>
                  <div className="space-y-2">
                    <a 
                      href={lead.quickbooks_payment_link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-sm font-medium text-blue-600 hover:underline break-all block"
                    >
                      {lead.quickbooks_payment_link}
                    </a>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(lead.quickbooks_payment_link!);
                          toast({
                            title: "Copied!",
                            description: "Payment link copied to clipboard",
                          });
                        }}
                      >
                        Copy Link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(lead.quickbooks_payment_link, '_blank')}
                      >
                        Open Link
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {!lead.quickbooks_customer_id && !lead.quickbooks_invoice_id && !lead.quickbooks_payment_link && (
                <p className="text-sm text-muted-foreground">No QuickBooks data available</p>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Form Submitted</label>
                <p className="font-medium">
                  {new Date(lead.form_submission_date).toLocaleDateString()}
                </p>
              </div>
              {lead.quote_sent_date && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Quote Sent</label>
                  <p className="font-medium">
                    {new Date(lead.quote_sent_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {lead.last_communication_date && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Communication</label>
                  <p className="font-medium">
                    {new Date(lead.last_communication_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {lead.payment_date && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Payment Date</label>
                  <p className="font-medium">
                    {new Date(lead.payment_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Communication Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Communication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Follow-up Count</label>
                <p className="font-medium">{lead.follow_up_count}</p>
              </div>
              {lead.last_email_sent_type && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Email Type</label>
                  <p className="font-medium">{lead.last_email_sent_type}</p>
                </div>
              )}
              {lead.last_sms_sent_type && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last SMS Type</label>
                  <p className="font-medium">{lead.last_sms_sent_type}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Reply Detected</label>
                <Badge variant={lead.reply_detected ? "default" : "secondary"}>
                  {lead.reply_detected ? "Yes" : "No"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Email Composer Modal */}
      {showEmailComposer && (
        <EmailComposer
          leadId={lead.id}
          recipientEmail={lead.director_email}
          recipientName={`${lead.director_first_name} ${lead.director_last_name}`}
          onClose={() => setShowEmailComposer(false)}
          onEmailSent={() => {
            setShowEmailComposer(false);
            fetchLeadDetails();
            fetchCommunicationHistory();
          }}
        />
      )}
    </div>
  );
}