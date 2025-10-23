import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, User, School, Music } from 'lucide-react'; 
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const NewLead = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEditing = !!id;
  const [formData, setFormData] = useState({
    director_first_name: '',
    director_last_name: '',
    director_email: '',
    director_phone_number: '',
    school_name: '',
    ensemble_program_name: '',
    workout_program_name: '',
    estimated_performers: '',
    season: '',
    status: 'New Lead',
    notes: ''
  });

  useEffect(() => {
    if (isEditing && id) {
      fetchLeadData();
    }
  }, [isEditing, id]);

  const fetchLeadData = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setFormData({
        director_first_name: data.director_first_name || '',
        director_last_name: data.director_last_name || '',
        director_email: data.director_email || '',
        director_phone_number: data.director_phone_number || '',
        school_name: data.school_name || '',
        ensemble_program_name: data.ensemble_program_name || '',
        workout_program_name: data.workout_program_name || '',
        estimated_performers: data.estimated_performers?.toString() || '',
        season: data.season || '',
        status: data.status || 'New Lead',
        notes: '' // Don't pre-fill notes for editing
      });
    } catch (error) {
      console.error('Error fetching lead data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch lead data",
        variant: "destructive",
      });
      navigate('/leads');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.director_first_name || !formData.director_last_name || !formData.director_email) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Name and Email)",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (isEditing && id) {
        // Update existing lead
        const { data, error } = await supabase
          .from('leads')
          .update({
            director_first_name: formData.director_first_name,
            director_last_name: formData.director_last_name,
            director_email: formData.director_email,
            director_phone_number: formData.director_phone_number || null,
            school_name: formData.school_name || null,
            ensemble_program_name: formData.ensemble_program_name || null,
            workout_program_name: formData.workout_program_name || null,
            estimated_performers: formData.estimated_performers ? parseInt(formData.estimated_performers) : null,
            season: formData.season || null,
            status: formData.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        // Add note to communication history if provided
        if (formData.notes.trim()) {
          await supabase
            .from('communication_history')
            .insert({
              lead_id: id,
              communication_type: 'note',
              direction: 'internal',
              subject: 'Lead updated with note',
              content: formData.notes.trim(),
              sent_at: new Date().toISOString(),
              metadata: { source: 'lead_edit' }
            });
        }

        toast({
          title: "Success",
          description: "Lead updated successfully",
        });

        navigate(`/lead/${id}`);
      } else {
        // Create new lead
        const leadData = {
          director_first_name: formData.director_first_name,
          director_last_name: formData.director_last_name,
          director_email: formData.director_email,
          director_phone_number: formData.director_phone_number || null,
          school_name: formData.school_name || null,
          ensemble_program_name: formData.ensemble_program_name || null,
          workout_program_name: formData.workout_program_name || null,
          estimated_performers: formData.estimated_performers ? parseInt(formData.estimated_performers) : null,
          season: formData.season || null,
          status: formData.status,
          form_submission_date: new Date().toISOString(),
          source: 'manual_entry',
          initial_note: formData.notes.trim() || null
        };

        // Call the webhook lead ingestion function
        const { data, error } = await supabase.functions.invoke('webhook-lead-ingestion', {
          body: leadData
        });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Lead created successfully",
        });

        navigate(`/lead/${data.id}`);
      }
    } catch (error) {
      console.error('Error saving lead:', error);
      toast({
        title: "Error",
        description: `Failed to ${isEditing ? 'update' : 'create'} lead. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading lead data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => navigate(isEditing ? `/lead/${id}` : '/leads')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {isEditing ? 'Back to Lead' : 'Back to Leads'}
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{isEditing ? 'Edit Lead' : 'Create New Lead'}</h1>
            <p className="text-muted-foreground">
              {isEditing ? 'Update lead information' : 'Add a new lead to your CRM system'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Contact Information
              </CardTitle>
              <CardDescription>Basic contact details for the lead</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.director_first_name}
                    onChange={(e) => handleInputChange('director_first_name', e.target.value)}
                    placeholder="Enter first name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.director_last_name}
                    onChange={(e) => handleInputChange('director_last_name', e.target.value)}
                    placeholder="Enter last name"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.director_email}
                    onChange={(e) => handleInputChange('director_email', e.target.value)}
                    placeholder="Enter email address"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.director_phone_number}
                    onChange={(e) => handleInputChange('director_phone_number', e.target.value)}
                    placeholder="Enter phone number"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* School Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <School className="h-5 w-5" />
                School Information
              </CardTitle>
              <CardDescription>Details about the educational institution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="schoolName">School Name</Label>
                <Input
                  id="schoolName"
                  value={formData.school_name}
                  onChange={(e) => handleInputChange('school_name', e.target.value)}
                  placeholder="Enter school name"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="season">Season</Label>
                  <Select value={formData.season} onValueChange={(value) => handleInputChange('season', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select season" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fall">Fall</SelectItem>
                      <SelectItem value="Winter">Winter</SelectItem>
                      <SelectItem value="Spring">Spring</SelectItem>
                      <SelectItem value="Summer">Summer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Program Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                Program Details
              </CardTitle>
              <CardDescription>Information about the music programs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ensembleProgram">Ensemble Program Name</Label>
                  <Input
                    id="ensembleProgram"
                    value={formData.ensemble_program_name}
                    onChange={(e) => handleInputChange('ensemble_program_name', e.target.value)}
                    placeholder="Enter ensemble program name"
                  />
                </div>
                <div>
                  <Label htmlFor="workoutProgram">Workout Program Name</Label>
                  <Input
                    id="workoutProgram"
                    value={formData.workout_program_name}
                    onChange={(e) => handleInputChange('workout_program_name', e.target.value)}
                    placeholder="Enter workout program name"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="performers">Estimated Number of Performers</Label>
                <Input
                  id="performers"
                  type="number"
                  min="1"
                  value={formData.estimated_performers}
                  onChange={(e) => handleInputChange('estimated_performers', e.target.value)}
                  placeholder="Enter estimated number of performers"
                />
              </div>
            </CardContent>
          </Card>

          {/* Lead Status & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
              <CardDescription>Set initial status and add any notes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="status">Initial Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New Lead">New Lead</SelectItem>
                    <SelectItem value="Active Follow-up">Active Follow-up</SelectItem>
                    <SelectItem value="Converted">Converted</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="notes">{isEditing ? 'Add Note' : 'Initial Notes'}</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder={isEditing ? "Add a note about this update..." : "Add any initial notes about this lead..."}
                  rows={4}
                />
                {isEditing && (
                  <p className="text-sm text-muted-foreground mt-1">
                    This note will be added to the communication history
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-end">
            <Button type="button" variant="outline" onClick={() => navigate(isEditing ? `/lead/${id}` : '/leads')}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? (isEditing ? 'Updating Lead...' : 'Creating Lead...') : (isEditing ? 'Update Lead' : 'Create Lead')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewLead;