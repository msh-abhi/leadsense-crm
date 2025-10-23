import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  TestTube, 
  Play, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Mail,
  Phone,
  Calendar,
  Users
} from 'lucide-react';
import { testFollowUpAutomation, checkFollowUpTemplates } from '@/utils/testFollowUpAutomation';
import { useToast } from '@/hooks/use-toast';

const TestFollowUp = () => {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [checkingTemplates, setCheckingTemplates] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [templateResult, setTemplateResult] = useState<any>(null);

  const handleTestAutomation = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const result = await testFollowUpAutomation();
      setTestResult(result);
      
      if (result.success) {
        toast({
          title: "Test Completed",
          description: `Found ${result.qualifyingLeads} leads qualifying for follow-up`,
        });
      } else {
        toast({
          title: "Test Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Test Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCheckTemplates = async () => {
    setCheckingTemplates(true);
    setTemplateResult(null);
    
    try {
      const result = await checkFollowUpTemplates();
      setTemplateResult(result);
      
      if (result.success) {
        toast({
          title: "Templates Checked",
          description: `Found ${result.templates?.length || 0} follow-up templates`,
        });
      } else {
        toast({
          title: "Template Check Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Template Check Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCheckingTemplates(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Follow-up Automation Test</h1>
          <p className="text-muted-foreground">
            Debug and test the follow-up automation system
          </p>
        </div>

        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Test Controls
            </CardTitle>
            <CardDescription>
              Run tests to diagnose follow-up automation issues
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                onClick={handleTestAutomation}
                disabled={testing}
                className="h-auto p-4 flex flex-col items-center gap-2"
              >
                {testing ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
                <div className="text-center">
                  <div className="font-medium">Test Follow-up Automation</div>
                  <div className="text-sm opacity-80">Check qualifying leads and trigger automation</div>
                </div>
              </Button>

              <Button
                onClick={handleCheckTemplates}
                disabled={checkingTemplates}
                variant="outline"
                className="h-auto p-4 flex flex-col items-center gap-2"
              >
                {checkingTemplates ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : (
                  <Mail className="h-6 w-6" />
                )}
                <div className="text-center">
                  <div className="font-medium">Check Templates</div>
                  <div className="text-sm opacity-80">Verify follow-up templates exist</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        {testResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                Automation Test Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {testResult.success ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <Users className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                      <div className="text-2xl font-bold">{testResult.totalLeads}</div>
                      <div className="text-sm text-muted-foreground">Total Leads</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <Calendar className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                      <div className="text-2xl font-bold">{testResult.qualifyingLeads}</div>
                      <div className="text-sm text-muted-foreground">Qualifying for Follow-up</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <Mail className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <div className="text-2xl font-bold">{testResult.automationResult?.processed || 0}</div>
                      <div className="text-sm text-muted-foreground">Processed</div>
                    </div>
                  </div>
                  
                  {testResult.automationResult && (
                    <div>
                      <h4 className="font-medium mb-2">Automation Results:</h4>
                      <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                        {JSON.stringify(testResult.automationResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{testResult.error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Template Results */}
        {templateResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {templateResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                Template Check Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              {templateResult.success ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Found {templateResult.templates?.length || 0} follow-up templates:
                  </p>
                  {templateResult.templates?.map((template: any) => (
                    <div key={template.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <div className="font-medium">Sequence {template.sequence_number}: {template.name}</div>
                        <div className="text-sm text-muted-foreground">{template.email_subject}</div>
                      </div>
                      <Badge variant={template.is_active ? "default" : "secondary"}>
                        {template.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{templateResult.error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Use This Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Step 1: Check Templates</h4>
              <p className="text-sm text-muted-foreground">
                First, verify that follow-up templates exist in your database. You need at least templates for sequences 1-4.
              </p>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <h4 className="font-medium">Step 2: Test Automation</h4>
              <p className="text-sm text-muted-foreground">
                This will check which leads qualify for follow-up and trigger the automation function. 
                Check the System Logs page for detailed execution logs.
              </p>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <h4 className="font-medium">Step 3: Review Logs</h4>
              <p className="text-sm text-muted-foreground">
                Go to System Logs to see detailed information about why leads may or may not be qualifying for follow-up.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TestFollowUp;