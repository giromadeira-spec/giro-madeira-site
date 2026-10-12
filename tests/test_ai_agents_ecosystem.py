import unittest
from scripts.ai_agents.ecosystem import recovery_plan,command_risk

class RecoverySafetyTests(unittest.TestCase):
    def test_uncertain_and_queued_deliveries_are_never_retried(self):
        for state in ('claimed','queued','uncertain','review_required'):
            self.assertEqual(recovery_plan({'delivery_status':state,'technical_cause_fixed':True,'editorial_eligible':True,'article_date_verified':True}), 'reconcile_existing_delivery_no_resend')
    def test_confirmed_delivery_is_not_resubmitted(self):
        self.assertEqual(recovery_plan({'delivery_status':'sent'}),'already_delivered_no_action')
    def test_editorial_hold_cannot_be_bypassed_by_technical_fix(self):
        self.assertEqual(recovery_plan({'technical_cause_fixed':True,'status':'falha'}),'editorial_hold_no_publish')
    def test_fixed_failure_resumes_existing_item_with_limit(self):
        item={'status':'falha','technical_cause_fixed':True,'editorial_eligible':True,'article_date_verified':True}
        self.assertEqual(recovery_plan(item),'resume_same_item')
        self.assertEqual(recovery_plan({**item,'retry_count':2}),'retry_limit_hold')
    def test_completed_render_resumes_conversion(self):
        self.assertEqual(recovery_plan({'editorial_eligible':True,'article_date_verified':True,'render_ready':True}), 'resume_conversion_same_item')
    def test_openhands_blocks_destructive_command_without_executing_it(self):
        self.assertEqual(command_risk('rm -rf /tmp/synthetic-never-executed'),'HIGH')
        self.assertEqual(command_risk('python -m unittest discover -s tests'),'LOW')

if __name__=='__main__':unittest.main()
