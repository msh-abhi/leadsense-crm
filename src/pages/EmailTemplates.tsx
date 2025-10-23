import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, CreditCard as Edit, Trash2, Save, Eye, Send, Loader as Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EmailTemplate {
  id: string;
  name: string;
  sequence_number: number;
  email_subject: string;
  email_body: string;
  sms_message: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const EmailTemplates = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [previewMode, setPreviewMode] = useState('edit');
  const [formData, setFormData] = useState({
    name: '',
    sequence_number: 1,
    email_subject: '',
    email_body: '',
    sms_message: '',
    is_active: true
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('follow_up_templates')
        .select('*')
        .order('sequence_number', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: "Error",
        description: "Failed to load email templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sequence_number: 1,
      email_subject: '',
      email_body: '',
      sms_message: '',
      is_active: true
    });
    setEditingTemplate(null);
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      sequence_number: template.sequence_number,
      email_subject: template.email_subject,
      email_body: template.email_body,
      sms_message: template.sms_message,
      is_active: template.is_active
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingTemplate) {
        // Update existing template
        const { error } = await supabase
          .from('follow_up_templates')
          .update({
            name: formData.name,
            sequence_number: formData.sequence_number,
            email_subject: formData.email_subject,
            email_body: formData.email_body,
            sms_message: formData.sms_message,
            is_active: formData.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Template updated successfully",
        });
      } else {
        // Create new template
        const { error } = await supabase
          .from('follow_up_templates')
          .insert({
            name: formData.name,
            sequence_number: formData.sequence_number,
            email_subject: formData.email_subject,
            email_body: formData.email_body,
            sms_message: formData.sms_message,
            is_active: formData.is_active
          });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Template created successfully",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('follow_up_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
      
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const handleSendTest = async () => {
    if (!testEmail || !formData.email_subject || !formData.email_body) {
      toast({
        title: "Missing Information",
        description: "Please fill in the email subject, body, and test recipient email",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsSendingTest(true);
    try {
      const response = await supabase.functions.invoke('send-email', {
        body: {
          to: testEmail,
          subject: `[TEST] ${formData.email_subject}`,
          content: formData.email_body,
          type: 'test_template'
        }
      });

      if (response.error) throw response.error;

      toast({
        title: "Test Email Sent",
        description: `Test email sent successfully to ${testEmail}`,
      });
    } catch (error) {
      console.error('Error sending test email:', error);
      toast({
        title: "Test Failed",
        description: "Failed to send test email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Templates</h1>
              <p className="text-muted-foreground">Manage your automated follow-up templates</p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            
            {/* --- START OF FIX --- */}
            <DialogContent className="sm:max-w-3xl h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>
                  {editingTemplate ? 'Edit Template' : 'Create New Template'}
                </DialogTitle>
                <DialogDescription>
                  Configure your follow-up email and SMS template with HTML support
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex-grow overflow-y-auto pr-4">
                <Tabs value={previewMode} onValueChange={setPreviewMode} className="space-y-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="edit">Edit Template</TabsTrigger>
                    <TabsTrigger value="preview">HTML Preview</TabsTrigger>
                  </TabsList>

                  <TabsContent value="edit" className="space-y-6">
                    <form id="template-form" onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="name">Template Name</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g., Follow-up Day 4"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="sequence">Sequence Number</Label>
                          <Input
                            id="sequence"
                            type="number"
                            value={formData.sequence_number}
                            onChange={(e) => setFormData(prev => ({ ...prev, sequence_number: parseInt(e.target.value) }))}
                            min="1"
                            max="10"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="subject">Email Subject</Label>
                        <Input
                          id="subject"
                          value={formData.email_subject}
                          onChange={(e) => setFormData(prev => ({ ...prev, email_subject: e.target.value }))}
                          placeholder="Follow-up: Your Music Program Quote"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="body">Email Body (HTML)</Label>
                        <p className="text-sm text-muted-foreground mb-2">
                          You can use HTML tags for formatting. Use the Preview tab to see how it will look.
                        </p>
                        <Textarea
                          id="body"
                          value={formData.email_body}
                          onChange={(e) => setFormData(prev => ({ ...prev, email_body: e.target.value }))}
                          placeholder="<p>Enter your HTML email content here...</p>"
                          rows={12}
                          required
                          className="font-mono text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="sms">SMS Message</Label>
                        <Textarea
                          id="sms"
                          value={formData.sms_message}
                          onChange={(e) => setFormData(prev => ({ ...prev, sms_message: e.target.value }))}
                          placeholder="SMS reminder about your quote..."
                          rows={3}
                          maxLength={160}
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          {formData.sms_message.length}/160 characters
                        </p>
                      </div>
                      
                      {/* Available Placeholders */}
                      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                        <h4 className="font-medium mb-3">Available Placeholders</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Copy and paste these placeholders into your email and SMS templates. They will be automatically replaced with lead-specific data.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm font-mono">
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{director_first_name}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{director_last_name}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{school_name}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{ensemble_program_name}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{workout_program_name}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{season}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{discount_rate_dr}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{standard_rate_sr}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{savings}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{early_bird_deadline}`}</code>
                           <code className="bg-background px-2 py-1 rounded text-xs">{`{payment_status}`}</code>
                        </div>
                      </div>
                    </form>
                  </TabsContent>

                  <TabsContent value="preview" className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-medium">Email Preview</Label>
                        <p className="text-sm text-muted-foreground">
                          This is how your HTML email will appear to recipients
                        </p>
                      </div>
                      
                      {/* Email Subject Preview */}
                      <div className="border rounded-lg p-4 bg-background">
                        <div className="border-b pb-2 mb-4">
                          <Label className="text-sm font-medium text-muted-foreground">Subject:</Label>
                          <p className="text-lg font-semibold">{formData.email_subject || 'No subject'}</p>
                        </div>
                        
                        {/* HTML Content Preview */}
                        <div className="border rounded-md p-4 bg-white min-h-[300px]">
                          {formData.email_body ? (
                            <div 
                              dangerouslySetInnerHTML={{ __html: formData.email_body }}
                              className="prose prose-sm max-w-none"
                            />
                          ) : (
                            <p className="text-muted-foreground italic">No email content to preview</p>
                          )}
                        </div>
                      </div>

                      {/* Test Send Section */}
                      <div className="border rounded-lg p-4 bg-muted/30">
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Send Test Email
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="testEmail">Test Recipient Email</Label>
                            <Input
                              id="testEmail"
                              type="email"
                              value={testEmail}
                              onChange={(e) => setTestEmail(e.target.value)}
                              placeholder="your-email@example.com"
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={handleSendTest}
                            disabled={isSendingTest || !testEmail || !formData.email_subject || !formData.email_body}
                            className="w-full"
                          >
                            {isSendingTest ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Sending Test...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                Send Test Email
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter className="pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" form="template-form">
                  <Save className="h-4 w-4 mr-2" />
                  {editingTemplate ? 'Update' : 'Create'} Template
                </Button>
              </DialogFooter>
            </DialogContent>
            {/* --- END OF FIX --- */}
          </Dialog>
        </div>

        {/* Templates Table */}
        <Card>
          <CardHeader>
            <CardTitle>Follow-up Templates</CardTitle>
            <CardDescription>
              Manage your automated follow-up templates for email and SMS
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sequence</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">#{template.sequence_number}</TableCell>
                      <TableCell>{template.name}</TableCell>
                      <TableCell>{template.email_subject}</TableCell>
                      <TableCell>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          HTML
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          template.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(template.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(template)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template.id)}
                            className="text-destructive hover:text-destructive h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {templates.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No templates found. Create your first template to get started.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* HTML Email Tips */}
        <Card>
          <CardHeader>
            <CardTitle>HTML Email Tips</CardTitle>
            <CardDescription>
              Best practices for creating HTML email templates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Basic HTML Tags</h4>
                <div className="space-y-1 text-sm font-mono">
                  <p><code>&lt;p&gt;</code> - Paragraphs</p>
                  <p><code>&lt;h1&gt;, &lt;h2&gt;</code> - Headings</p>
                  <p><code>&lt;strong&gt;</code> - Bold text</p>
                  <p><code>&lt;em&gt;</code> - Italic text</p>
                  <p><code>&lt;br&gt;</code> - Line breaks</p>
                  <p><code>&lt;a href=""&gt;</code> - Links</p>
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Email-Safe Styling</h4>
                <div className="space-y-1 text-sm">
                  <p>• Use inline CSS styles</p>
                  <p>• Avoid external stylesheets</p>
                  <p>• Use table-based layouts for complex designs</p>
                  <p>• Test across different email clients</p>
                  <p>• Keep width under 600px</p>
                </div>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <h4 className="font-medium mb-2 text-blue-800">Example HTML Template</h4>
              <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
{`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333; margin-bottom: 20px;">Hello {director_first_name}!</h2>
  <p style="line-height: 1.6; color: #555;">
    Thank you for your interest in our <strong>{workout_program_name}</strong> program.
  </p>
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0; color: #333;">Program Details</h3>
    <p style="margin-bottom: 0;">School: {school_name}</p>
    <p style="margin-bottom: 0;">Season: {season}</p>
  </div>
  <p style="color: #555;">Best regards,<br>Your Team</p>
</div>`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmailTemplates;