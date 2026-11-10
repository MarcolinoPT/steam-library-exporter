@manual @firefox
Feature: Classification job lifecycle in the Firefox popup

  Background:
    Given the Steam Library Exporter extension is loaded in Firefox
    And I am signed in to the Steam account whose library I am inspecting
    And the extension popup is open

  @resume
  Scenario: Resume an active classification after closing and reopening the popup
    Given the selected classification contains multiple AppIDs
    And no classification job is currently running
    When I start the classification
    And I wait until at least one metadata request has completed
    And I close the extension popup before the classification finishes
    And I reopen the extension popup
    Then the popup reports that the existing classification is being resumed
    And progress reflects the requests already attempted
    And the classification continues without restarting from the first AppID
    And the final result is displayed when the job completes

  @concurrency
  Scenario: Reject a competing start while a classification is active
    Given a classification containing multiple AppIDs is running
    When I inspect the popup controls
    Then the competing classification controls are disabled
    And the package-probe control is disabled
    When I open the popup's DevTools console while the first job is still running
    And I execute the following request:
      """
      const response = await browser.runtime.sendMessage({
        type: "START_CLASSIFICATION"
      });
      console.log(response);
      """
    Then the response has ok equal to false
    And the response error contains "already running"
    And the existing classification remains the only active job
    And its progress is not reset or replaced

  @action-serialization
  Scenario: Prevent profile classification while source comparison is pending
    Given the authenticated Steam Community source request can be held pending by a controlled local response
    When I start a source comparison
    Then the source comparison, profile comparison, classification, and package-probe controls are disabled
    When I toggle the own-profile confirmation checkbox
    Then profile comparison and profile classification controls remain disabled
    When I release the controlled Steam Community response
    Then the source comparison completes
    And profile actions become available only if own-profile confirmation is checked

  @timeout
  Scenario: Stop a classification when an AppDetails request times out
    Given a classification is ready to request metadata for an AppID
    And the AppDetails request is held pending for longer than 15 seconds using a controlled test response or local proxy
    When the classification requests that AppID
    And I wait for the metadata request timeout
    Then the classification finishes with the stop reason "timeout"
    And the request is aborted
    And the request failure count is incremented
    And the popup reports that the classification stopped
    And no further AppDetails requests are started for that job

  @recovery
  Scenario: Allow a new classification after a timed-out job has finished
    Given a classification has finished because an AppDetails request timed out
    When I start a new classification
    Then the new classification is accepted
    And it receives a new job identifier
    And the previous job's timeout state does not block the new job

  @preparation
  Scenario: Reject competing starts and resume after extended pending source preparation
    Given no classification job is currently running
    And the profile-only classification's authenticated Steam Community source request is held pending by a controlled local response
    And source refresh and profile-page inspection together take longer than the previous 30-second polling window while each operation completes before its own timeout
    When I start the profile-only classification in the first popup
    Then the background status reports that classification setup is preparing
    When I send a competing START_CLASSIFICATION request from the popup DevTools console
    Then the request is rejected with an "already running" response
    When I close the first popup while source preparation is still pending
    And I reopen the extension popup before releasing the controlled response
    Then the popup reports that it is waiting for classification setup
    And its controls remain disabled while setup is still preparing
    And it continues checking beyond 60 polling intervals without requiring another popup reopen
    When I release the controlled Steam Community response and profile-page inspection succeeds
    Then the reopened popup discovers the resulting job and resumes polling
    And no duplicate classification job is created

  @setup-failure
  Scenario: Release the classification start reservation when source preparation fails
    Given no classification job is currently running
    And Steam source preparation is configured to fail using a controlled test response
    When I start a classification
    Then the popup reports the preparation failure
    And no classification job is left active
    When I restore the Steam source response and start the classification again
    Then the new classification start is accepted

  @privacy
  Scenario: Display aggregate classification results without persisting library data
    Given a classification has completed
    When I inspect the displayed result and the extension's stored data
    Then only aggregate classification counts are displayed
    And no library data or Steam authentication material is persisted
