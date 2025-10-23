import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Settings as SettingsIcon, 
  User, 
  Bell, 
  Shield, 
  Database,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const Settings = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    companySettings,
    userProfile,
    notificationSettings,
    loading: settingsLoading,
    saveCompanySettings,
    saveUserProfile,
    saveNotificationSettings,
    refreshSettings
  } = useSettings();

  const [saving, setSaving] = useState<string | null>(null);
  const [localCompanySettings, setLocalCompanySettings] = useState({
    company_name: '',
    company_email: '',
    company_phone: '',
    timezone: '',
    currency: ''
  });

  const [localUserProfile, setLocalUserProfile] = useState({
    first_name: '',
    last_name: '',
    email: '',
    role: '',
    bio: ''
  });

  const [localNotificationSettings, setLocalNotificationSettings] = useState({
    email_notifications: true,
    sms_notifications: false,
    new_lead_alerts: true,
    follow_up_reminders: true,
    payment_notifications: true,
    system_alerts: true
  });

  // Update local state when settings are loaded
  useEffect(() => {
    if (companySettings) {
      setLocalCompanySettings({
        company_name: companySettings.company_name || '',
        company_email: companySettings.company_email || '',
        company_phone: companySettings.company_phone || '',
        timezone: companySettings.timezone || '',
        currency: companySettings.currency || ''
      });
    }
  }, [companySettings]);

  useEffect(() => {
    if (userProfile) {
      setLocalUserProfile({
        first_name: userProfile.first_name || '',
        last_name: userProfile.last_name || '',
        email: userProfile.email || '',
        role: userProfile.role || '',
        bio: userProfile.bio || ''
      });
    }
  }, [userProfile]);

  useEffect(() => {
    if (notificationSettings) {
      setLocalNotificationSettings({
        email_notifications: notificationSettings.email_notifications,
        sms_notifications: notificationSettings.sms_notifications,
        new_lead_alerts: notificationSettings.new_lead_alerts,
        follow_up_reminders: notificationSettings.follow_up_reminders,
        payment_notifications: notificationSettings.payment_notifications,
        system_alerts: notificationSettings.system_alerts
      });
    }
  }, [notificationSettings]);

  const handleSaveCompanySettings = async () => {
    setSaving('company');
    try {
      const { error } = await saveCompanySettings(localCompanySettings);
      
      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: "Company settings saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to save company settings: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleSaveUserProfile = async () => {
    setSaving('profile');
    try {
      const { error } = await saveUserProfile(localUserProfile);
      
      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: "Profile saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to save profile: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleSaveNotificationSettings = async () => {
    setSaving('notifications');
    try {
      const { error } = await saveNotificationSettings(localNotificationSettings);
      
      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: "Notification settings saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to save notification settings: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Manage your CRM configuration and preferences
            </p>
          </div>
          <Button
            onClick={refreshSettings}
            variant="outline"
            size="sm"
            className="premium-button"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="general" className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card className="premium-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5" />
                  Company Settings
                </CardTitle>
                <CardDescription>
                  Basic configuration for your CRM system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyName" className="text-sm font-medium text-foreground">Company Name</Label>
                    <Input
                      id="companyName"
                      value={localCompanySettings.company_name}
                      onChange={(e) => setLocalCompanySettings(prev => ({ ...prev, company_name: e.target.value }))}
                      placeholder="Enter company name"
                      className="mt-2 premium-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyEmail" className="text-sm font-medium text-foreground">Company Email</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      value={localCompanySettings.company_email}
                      onChange={(e) => setLocalCompanySettings(prev => ({ ...prev, company_email: e.target.value }))}
                      placeholder="Enter company email"
                      className="mt-2 premium-input"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyPhone" className="text-sm font-medium text-foreground">Company Phone</Label>
                    <Input
                      id="companyPhone"
                      value={localCompanySettings.company_phone}
                      onChange={(e) => setLocalCompanySettings(prev => ({ ...prev, company_phone: e.target.value }))}
                      placeholder="Enter company phone"
                      className="mt-2 premium-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="timezone" className="text-sm font-medium text-foreground">Timezone</Label>
                    <Select 
                      value={localCompanySettings.timezone} 
                      onValueChange={(value) => setLocalCompanySettings(prev => ({ ...prev, timezone: value }))}
                    >
                      <SelectTrigger className="mt-2 premium-input">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Los_Angeles">Pacific Time (PST)</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time (MST)</SelectItem>
                        <SelectItem value="America/Chicago">Central Time (CST)</SelectItem>
                        <SelectItem value="America/New_York">Eastern Time (EST)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="currency" className="text-sm font-medium text-foreground">Default Currency</Label>
                  <Select 
                    value={localCompanySettings.currency} 
                    onValueChange={(value) => setLocalCompanySettings(prev => ({ ...prev, currency: value }))}
                  >
                    <SelectTrigger className="w-full mt-2 premium-input">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">US Dollar (USD)</SelectItem>
                      <SelectItem value="CAD">Canadian Dollar (CAD)</SelectItem>
                      <SelectItem value="EUR">Euro (EUR)</SelectItem>
                      <SelectItem value="GBP">British Pound (GBP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSaveCompanySettings} 
                    disabled={saving === 'company'}
                    className="premium-button"
                  >
                    {saving === 'company' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6">
            <Card className="premium-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  User Profile
                </CardTitle>
                <CardDescription>
                  Manage your personal information and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName" className="text-sm font-medium text-foreground">First Name</Label>
                    <Input
                      id="firstName"
                      value={localUserProfile.first_name}
                      onChange={(e) => setLocalUserProfile(prev => ({ ...prev, first_name: e.target.value }))}
                      placeholder="Enter first name"
                      className="mt-2 premium-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="text-sm font-medium text-foreground">Last Name</Label>
                    <Input
                      id="lastName"
                      value={localUserProfile.last_name}
                      onChange={(e) => setLocalUserProfile(prev => ({ ...prev, last_name: e.target.value }))}
                      placeholder="Enter last name"
                      className="mt-2 premium-input"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={localUserProfile.email}
                    onChange={(e) => setLocalUserProfile(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email address"
                    className="mt-2 premium-input"
                  />
                </div>

                <div>
                  <Label htmlFor="role" className="text-sm font-medium text-foreground">Role</Label>
                  <Select 
                    value={localUserProfile.role} 
                    onValueChange={(value) => setLocalUserProfile(prev => ({ ...prev, role: value }))}
                  >
                    <SelectTrigger className="mt-2 premium-input">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Administrator">Administrator</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                      <SelectItem value="Sales Rep">Sales Representative</SelectItem>
                      <SelectItem value="Support">Support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="bio" className="text-sm font-medium text-foreground">Bio</Label>
                  <Textarea
                    id="bio"
                    value={localUserProfile.bio}
                    onChange={(e) => setLocalUserProfile(prev => ({ ...prev, bio: e.target.value }))}
                    rows={3}
                    placeholder="Enter a brief bio"
                    className="mt-2 premium-input"
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSaveUserProfile} 
                    disabled={saving === 'profile'}
                    className="premium-button"
                  >
                    {saving === 'profile' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Profile
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card className="premium-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>
                  Configure how and when you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/30">
                    <div>
                      <Label htmlFor="emailNotifications" className="text-sm font-medium text-foreground">Email Notifications</Label>
                      <p className="text-xs text-muted-foreground mt-1">Receive notifications via email</p>
                    </div>
                    <Switch
                      id="emailNotifications"
                      checked={localNotificationSettings.email_notifications}
                      onCheckedChange={(checked) => setLocalNotificationSettings(prev => ({ ...prev, email_notifications: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/30">
                    <div>
                      <Label htmlFor="smsNotifications" className="text-sm font-medium text-foreground">SMS Notifications</Label>
                      <p className="text-xs text-muted-foreground mt-1">Receive notifications via SMS</p>
                    </div>
                    <Switch
                      id="smsNotifications"
                      checked={localNotificationSettings.sms_notifications}
                      onCheckedChange={(checked) => setLocalNotificationSettings(prev => ({ ...prev, sms_notifications: checked }))}
                    />
                  </div>

                  <Separator className="my-6" />

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/30">
                    <div>
                      <Label htmlFor="newLeadAlerts" className="text-sm font-medium text-foreground">New Lead Alerts</Label>
                      <p className="text-xs text-muted-foreground mt-1">Get notified when new leads are created</p>
                    </div>
                    <Switch
                      id="newLeadAlerts"
                      checked={localNotificationSettings.new_lead_alerts}
                      onCheckedChange={(checked) => setLocalNotificationSettings(prev => ({ ...prev, new_lead_alerts: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/30">
                    <div>
                      <Label htmlFor="followUpReminders" className="text-sm font-medium text-foreground">Follow-up Reminders</Label>
                      <p className="text-xs text-muted-foreground mt-1">Reminders for scheduled follow-ups</p>
                    </div>
                    <Switch
                      id="followUpReminders"
                      checked={localNotificationSettings.follow_up_reminders}
                      onCheckedChange={(checked) => setLocalNotificationSettings(prev => ({ ...prev, follow_up_reminders: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/30">
                    <div>
                      <Label htmlFor="paymentNotifications" className="text-sm font-medium text-foreground">Payment Notifications</Label>
                      <p className="text-xs text-muted-foreground mt-1">Alerts when payments are received</p>
                    </div>
                    <Switch
                      id="paymentNotifications"
                      checked={localNotificationSettings.payment_notifications}
                      onCheckedChange={(checked) => setLocalNotificationSettings(prev => ({ ...prev, payment_notifications: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/30">
                    <div>
                      <Label htmlFor="systemAlerts" className="text-sm font-medium text-foreground">System Alerts</Label>
                      <p className="text-xs text-muted-foreground mt-1">Important system notifications</p>
                    </div>
                    <Switch
                      id="systemAlerts"
                      checked={localNotificationSettings.system_alerts}
                      onCheckedChange={(checked) => setLocalNotificationSettings(prev => ({ ...prev, system_alerts: checked }))}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSaveNotificationSettings} 
                    disabled={saving === 'notifications'}
                    className="premium-button"
                  >
                    {saving === 'notifications' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Preferences
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <Card className="premium-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Data Management
                </CardTitle>
                <CardDescription>
                  Backup, export, and manage your CRM data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-3 text-foreground">Data Export</h4>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      Export your CRM data for backup or analysis
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" className="premium-button">
                        Export Leads (CSV)
                      </Button>
                      <Button variant="outline" className="premium-button">
                        Export Communications (CSV)
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div>
                    <h4 className="font-semibold mb-3 text-foreground">Data Cleanup</h4>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      Clean up old or inactive data
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" className="premium-button">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Clean Old Logs
                      </Button>
                      <Button variant="outline" className="premium-button">
                        Archive Inactive Leads
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div>
                    <h4 className="font-semibold mb-3 text-foreground">Backup Settings</h4>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      Configure automatic data backups
                    </p>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                        <span className="text-sm font-medium text-foreground">Automatic Daily Backup</span>
                        <Switch defaultChecked />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                        <span className="text-sm font-medium text-foreground">Weekly Email Reports</span>
                        <Switch defaultChecked />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button variant="outline" className="premium-button">
                    <Save className="h-4 w-4 mr-2" />
                    Save Data Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Settings Status */}
        {(companySettings || userProfile || notificationSettings) && (
          <Card className="premium-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Settings Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-green-700">Company settings loaded</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-green-700">User profile loaded</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-green-700">Notifications configured</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Settings;